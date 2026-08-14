package flageval

import (
	"encoding/json"
	"fmt"
	"os"
)

// ManifestFile is the on-disk shape of a portable flag catalog.
type ManifestFile struct {
	SchemaVersion int       `json:"schemaVersion"`
	Flags         []Flag    `json:"flags"`
	Segments      []Segment `json:"segments,omitempty"`
}

// Manifest is a loaded, keyed catalog plus a pure evaluator.
type Manifest struct {
	SchemaVersion int
	Flags         []Flag
	byKey         map[string]Flag
}

// LoadManifest reads a JSON catalog from path.
func LoadManifest(path string) (Manifest, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Manifest{}, err
	}
	return ParseManifest(raw)
}

// ParseManifest decodes a JSON catalog, inlines named segments into rule
// predicates, and validates load-time contracts (unknown segments, variant
// weights, namespace ranges, overlapping namespaces).
func ParseManifest(raw []byte) (Manifest, error) {
	var file ManifestFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return Manifest{}, fmt.Errorf("flageval: decode manifest: %w", err)
	}
	if file.SchemaVersion != 1 {
		return Manifest{}, fmt.Errorf("flageval: unsupported schemaVersion %d", file.SchemaVersion)
	}
	segments, err := resolveSegments(file.Segments)
	if err != nil {
		return Manifest{}, err
	}
	m := Manifest{
		SchemaVersion: file.SchemaVersion,
		Flags:         make([]Flag, 0, len(file.Flags)),
		byKey:         make(map[string]Flag, len(file.Flags)),
	}
	for _, f := range file.Flags {
		if f.Key == "" {
			return Manifest{}, fmt.Errorf("flageval: flag with empty key")
		}
		if _, exists := m.byKey[f.Key]; exists {
			return Manifest{}, fmt.Errorf("flageval: duplicate flag %q", f.Key)
		}
		if err := inlineSegments(&f, segments); err != nil {
			return Manifest{}, err
		}
		if err := validateFlag(f); err != nil {
			return Manifest{}, fmt.Errorf("flageval: flag %q: %w", f.Key, err)
		}
		m.Flags = append(m.Flags, f)
		m.byKey[f.Key] = f
	}
	if err := checkNamespaceOverlaps(m.Flags); err != nil {
		return Manifest{}, err
	}
	return m, nil
}

func resolveSegments(segs []Segment) (map[string]Predicate, error) {
	out := make(map[string]Predicate, len(segs))
	for _, s := range segs {
		if s.Key == "" {
			return nil, fmt.Errorf("flageval: segment missing key")
		}
		if _, dup := out[s.Key]; dup {
			return nil, fmt.Errorf("flageval: duplicate segment key %q", s.Key)
		}
		out[s.Key] = s.Predicate
	}
	return out, nil
}

func inlineSegments(f *Flag, segments map[string]Predicate) error {
	for i := range f.Rules {
		name := f.Rules[i].Segment
		if name == "" {
			continue
		}
		seg, ok := segments[name]
		if !ok {
			return fmt.Errorf("flageval: flag %q rule[%d] references unknown segment %q", f.Key, i, name)
		}
		if f.Rules[i].If != nil {
			existing := *f.Rules[i].If
			f.Rules[i].If = &Predicate{All: []Predicate{existing, seg}}
		} else {
			inlined := seg
			f.Rules[i].If = &inlined
		}
		f.Rules[i].Segment = ""
	}
	return nil
}

func validateFlag(f Flag) error {
	switch f.Type {
	case TypeBool, TypeString, TypeNumber, TypeJSON:
	default:
		return fmt.Errorf("invalid type %q", f.Type)
	}
	if f.Scope != "" && f.Scope != ScopeCrossProject {
		return fmt.Errorf("invalid scope %q", f.Scope)
	}
	if len(f.Default) == 0 {
		return fmt.Errorf("default is required")
	}
	if err := typeCheckJSON(f.Type, f.Default); err != nil {
		return fmt.Errorf("default: %w", err)
	}
	if f.KillDate != "" {
		if len(f.KillDate) != 10 || f.KillDate[4] != '-' || f.KillDate[7] != '-' {
			return fmt.Errorf("killDate: expected YYYY-MM-DD, got %q", f.KillDate)
		}
	}
	if f.Namespace != "" {
		lo, hi := f.NamespaceRange[0], f.NamespaceRange[1]
		if lo < 0 || hi > 1 || lo >= hi {
			return fmt.Errorf("namespaceRange %v invalid; want 0 <= start < end <= 1", f.NamespaceRange)
		}
	}
	if len(f.Schema) > 0 {
		if f.Type != TypeJSON {
			return fmt.Errorf("schema is only meaningful for type=json (got %q)", f.Type)
		}
		if err := validateAgainstSchema(f.Schema, f.Default); err != nil {
			return fmt.Errorf("default fails schema: %w", err)
		}
	}
	for i, r := range f.Rules {
		if len(r.Value) > 0 {
			if err := typeCheckJSON(f.Type, r.Value); err != nil {
				return fmt.Errorf("rule[%d].value: %w", i, err)
			}
			if len(f.Schema) > 0 {
				if err := validateAgainstSchema(f.Schema, r.Value); err != nil {
					return fmt.Errorf("rule[%d].value fails schema: %w", i, err)
				}
			}
		}
		if r.Rollout != nil {
			if r.Rollout.Percentage < 0 || r.Rollout.Percentage > 100 {
				return fmt.Errorf("rule[%d].rollout.percentage out of range", i)
			}
			if r.Rollout.Seed == "" {
				return fmt.Errorf("rule[%d].rollout.seed required", i)
			}
		}
		if len(r.Variants) > 0 {
			if len(r.Value) > 0 {
				return fmt.Errorf("rule[%d]: variants and value are mutually exclusive", i)
			}
			sum := 0
			seenKeys := map[string]bool{}
			for j, v := range r.Variants {
				if v.Key == "" {
					return fmt.Errorf("rule[%d].variants[%d]: missing key", i, j)
				}
				if seenKeys[v.Key] {
					return fmt.Errorf("rule[%d].variants[%d]: duplicate key %q", i, j, v.Key)
				}
				seenKeys[v.Key] = true
				if v.Weight < 0 || v.Weight > 100 {
					return fmt.Errorf("rule[%d].variants[%d].weight out of range", i, j)
				}
				sum += v.Weight
				if len(v.Value) > 0 {
					if err := typeCheckJSON(f.Type, v.Value); err != nil {
						return fmt.Errorf("rule[%d].variants[%d].value: %w", i, j, err)
					}
					if len(f.Schema) > 0 {
						if err := validateAgainstSchema(f.Schema, v.Value); err != nil {
							return fmt.Errorf("rule[%d].variants[%d].value fails schema: %w", i, j, err)
						}
					}
				}
			}
			if sum != 100 {
				return fmt.Errorf("rule[%d]: variant weights sum to %d, must be 100", i, sum)
			}
		}
	}
	return nil
}

func checkNamespaceOverlaps(flags []Flag) error {
	type span struct {
		key    string
		lo, hi float64
	}
	byNS := map[string][]span{}
	for _, f := range flags {
		if f.Namespace == "" {
			continue
		}
		byNS[f.Namespace] = append(byNS[f.Namespace], span{
			key: f.Key, lo: f.NamespaceRange[0], hi: f.NamespaceRange[1],
		})
	}
	for ns, spans := range byNS {
		for i := 0; i < len(spans); i++ {
			for j := i + 1; j < len(spans); j++ {
				if spans[i].lo < spans[j].hi && spans[j].lo < spans[i].hi {
					return fmt.Errorf("flageval: namespace %q: %q overlaps %q", ns, spans[i].key, spans[j].key)
				}
			}
		}
	}
	return nil
}

func typeCheckJSON(t FlagType, raw json.RawMessage) error {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	switch t {
	case TypeBool:
		if _, ok := v.(bool); !ok {
			return fmt.Errorf("expected boolean, got %T", v)
		}
	case TypeString:
		if _, ok := v.(string); !ok {
			return fmt.Errorf("expected string, got %T", v)
		}
	case TypeNumber:
		if _, ok := v.(float64); !ok {
			return fmt.Errorf("expected number, got %T", v)
		}
	}
	return nil
}

// Flag returns a flag by key.
func (m Manifest) Flag(key string) (Flag, bool) {
	f, ok := m.byKey[key]
	return f, ok
}

// Evaluate looks up key and runs the pure evaluator. Missing keys return
// SourceMissing. Cyclic prerequisites fail closed (not found) instead of
// overflowing the stack.
func (m Manifest) Evaluate(key string, ctx Context) EvalResult {
	return m.evaluate(key, ctx, map[string]struct{}{})
}

func (m Manifest) evaluate(key string, ctx Context, visiting map[string]struct{}) EvalResult {
	if _, seen := visiting[key]; seen {
		return EvalResult{
			Key:    key,
			Source: SourceMissing,
			Reason: "cyclic prerequisite",
			Found:  false,
		}
	}
	f, ok := m.byKey[key]
	if !ok {
		return EvalResult{
			Key:    key,
			Source: SourceMissing,
			Reason: "flag not registered",
			Found:  false,
		}
	}
	visiting[key] = struct{}{}
	defer delete(visiting, key)
	e := &Evaluator{
		PrereqResolver: func(k string, c Context) (EvalResult, bool) {
			r := m.evaluate(k, c, visiting)
			return r, r.Found
		},
	}
	return e.Evaluate(f, ctx)
}
