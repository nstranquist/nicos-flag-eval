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

// ParseManifest decodes a JSON catalog.
func ParseManifest(raw []byte) (Manifest, error) {
	var file ManifestFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return Manifest{}, fmt.Errorf("flageval: decode manifest: %w", err)
	}
	if file.SchemaVersion != 1 {
		return Manifest{}, fmt.Errorf("flageval: unsupported schemaVersion %d", file.SchemaVersion)
	}
	m := Manifest{
		SchemaVersion: file.SchemaVersion,
		Flags:         file.Flags,
		byKey:         make(map[string]Flag, len(file.Flags)),
	}
	for _, f := range file.Flags {
		if f.Key == "" {
			return Manifest{}, fmt.Errorf("flageval: flag with empty key")
		}
		if _, exists := m.byKey[f.Key]; exists {
			return Manifest{}, fmt.Errorf("flageval: duplicate flag %q", f.Key)
		}
		if err := validateFlagValues(f); err != nil {
			return Manifest{}, err
		}
		m.byKey[f.Key] = f
	}
	return m, nil
}

func validateFlagValues(f Flag) error {
	if len(f.Schema) == 0 {
		return nil
	}
	if len(f.Default) > 0 {
		if err := validateAgainstSchema(f.Schema, f.Default); err != nil {
			return fmt.Errorf("flageval: flag %q default: %w", f.Key, err)
		}
	}
	for i, r := range f.Rules {
		if len(r.Value) > 0 {
			if err := validateAgainstSchema(f.Schema, r.Value); err != nil {
				return fmt.Errorf("flageval: flag %q rule[%d]: %w", f.Key, i, err)
			}
		}
		for j, v := range r.Variants {
			if len(v.Value) > 0 {
				if err := validateAgainstSchema(f.Schema, v.Value); err != nil {
					return fmt.Errorf("flageval: flag %q rule[%d] variant[%d]: %w", f.Key, i, j, err)
				}
			}
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
// SourceMissing. Prereqs re-enter this method.
func (m Manifest) Evaluate(key string, ctx Context) EvalResult {
	f, ok := m.byKey[key]
	if !ok {
		return EvalResult{
			Key:    key,
			Source: SourceMissing,
			Reason: "flag not registered",
			Found:  false,
		}
	}
	e := &Evaluator{
		PrereqResolver: func(k string, c Context) (EvalResult, bool) {
			r := m.Evaluate(k, c)
			return r, r.Found
		},
	}
	return e.Evaluate(f, ctx)
}
