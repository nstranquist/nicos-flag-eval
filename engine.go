package flageval

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Evaluator is the deterministic, pure rule evaluator. It does not touch
// disk, env vars, or override files.
type Evaluator struct {
	// PrereqResolver lets a rule's Prereq re-enter a full resolver. Pass
	// Manifest.Evaluate here in production. Tests can pass a stub. When
	// nil, prereqs unconditionally fail (treat as not satisfied).
	PrereqResolver func(key string, ctx Context) (EvalResult, bool)

	// OnExposure is invoked once per successful evaluation. Fires AFTER
	// the result is computed so handler latency does not gate the answer.
	// Safe to leave nil.
	OnExposure func(ExposureEvent)
}

// ExposureEvent is the typed payload Evaluator hands to OnExposure.
type ExposureEvent struct {
	Key     string          `json:"key"`
	Variant string          `json:"variant,omitempty"`
	Value   json.RawMessage `json:"value"`
	Source  Source          `json:"source"`
	UserID  string          `json:"userId,omitempty"`
	Env     string          `json:"env,omitempty"`
	Project string          `json:"project,omitempty"`
	TS      string          `json:"ts"`
}

// Evaluate runs the rule chain + kill-date + default for one flag. The
// returned EvalResult always carries a Value; Found is true unless the
// flag has no default and no rule matched.
func (e *Evaluator) Evaluate(f Flag, ctx Context) EvalResult {
	res := e.evaluateInner(f, ctx)
	if e.OnExposure != nil && res.Found {
		e.OnExposure(ExposureEvent{
			Key:     res.Key,
			Variant: res.Variant,
			Value:   res.Value,
			Source:  res.Source,
			UserID:  ctx.UserID,
			Env:     ctx.Env,
			Project: ctx.Project,
			TS:      time.Now().UTC().Format(time.RFC3339Nano),
		})
	}
	return res
}

func (e *Evaluator) evaluateInner(f Flag, ctx Context) EvalResult {
	for i, r := range f.Rules {
		if !e.ruleMatches(f, r, ctx) {
			continue
		}
		val := r.Value
		variantKey := ""
		if len(r.Variants) > 0 {
			variantKey, val = pickVariant(f.Key, f.HashVersion, i, r, ctx)
		}
		if len(val) == 0 {
			val = f.Default
		}
		return EvalResult{
			Key:     f.Key,
			Value:   val,
			Source:  SourceRule,
			Reason:  ruleReason(r, i),
			Rule:    i + 1,
			Variant: variantKey,
			Found:   true,
		}
	}

	if f.KillDate != "" {
		killed, err := killDatePassed(f.KillDate, ctx.Now)
		if err == nil && killed {
			val := f.KillValue
			if len(val) == 0 {
				val = killZero(f.Type)
			}
			return EvalResult{
				Key:    f.Key,
				Value:  val,
				Source: SourceKillDate,
				Reason: "kill date " + f.KillDate + " passed",
				Found:  true,
			}
		}
	}

	return EvalResult{
		Key:    f.Key,
		Value:  f.Default,
		Source: SourceDefault,
		Reason: "no rule matched",
		Found:  len(f.Default) > 0,
	}
}

func (e *Evaluator) ruleMatches(f Flag, r Rule, ctx Context) bool {
	if r.If != nil && !predicateMatches(*r.If, ctx) {
		return false
	}
	if r.Prereq != nil {
		if e.PrereqResolver == nil {
			return false
		}
		got, ok := e.PrereqResolver(r.Prereq.Key, ctx)
		if !ok || !got.Found {
			return false
		}
		if !rawJSONEqual(got.Value, r.Prereq.Equals) {
			return false
		}
	}
	if r.Rollout != nil {
		if !rolloutHits(*r.Rollout, f.HashVersion, ctx) {
			return false
		}
	}
	if f.Namespace != "" {
		if !namespaceHits(f, ctx) {
			return false
		}
	}
	return true
}

func namespaceHits(f Flag, ctx Context) bool {
	attr := ctx.UserID
	if attr == "" {
		return false
	}
	bucket := float64(Bucket("ns:"+f.Namespace, attr)) / 100.0
	return bucket >= f.NamespaceRange[0] && bucket < f.NamespaceRange[1]
}

func predicateMatches(p Predicate, ctx Context) bool {
	if p.Env != "" && p.Env != ctx.Env {
		return false
	}
	if len(p.Envs) > 0 && !inSlice(p.Envs, ctx.Env) {
		return false
	}
	if p.Project != "" && p.Project != ctx.Project {
		return false
	}
	if len(p.Projects) > 0 && !inSlice(p.Projects, ctx.Project) {
		return false
	}
	if p.UserID != "" && p.UserID != ctx.UserID {
		return false
	}
	if len(p.UserIDIn) > 0 && !inSlice(p.UserIDIn, ctx.UserID) {
		return false
	}
	for k, want := range p.Attr {
		if ctx.Attrs[k] != want {
			return false
		}
	}
	for _, c := range p.Constraints {
		if !constraintMatches(c, ctx) {
			return false
		}
	}
	if len(p.All) > 0 {
		for _, sub := range p.All {
			if !predicateMatches(sub, ctx) {
				return false
			}
		}
	}
	if len(p.Any) > 0 {
		anyMatch := false
		for _, sub := range p.Any {
			if predicateMatches(sub, ctx) {
				anyMatch = true
				break
			}
		}
		if !anyMatch {
			return false
		}
	}
	if p.Not != nil {
		if predicateMatches(*p.Not, ctx) {
			return false
		}
	}
	return true
}

func pickVariant(flagKey string, hashVersion int, ruleIdx int, r Rule, ctx Context) (string, json.RawMessage) {
	var seed, attr string
	if r.Rollout != nil && r.Rollout.Seed != "" {
		seed = r.Rollout.Seed
		attr = rolloutAttr(r.Rollout.By, ctx)
	} else {
		seed = flagKey + "|rule-" + strconv.Itoa(ruleIdx)
		attr = ctx.UserID
		if attr == "" {
			attr = ctx.Project
		}
		if attr == "" {
			attr = ctx.Env
		}
	}
	if hashVersion > 0 {
		seed = seed + "|v" + strconv.Itoa(hashVersion)
	}
	bucket := Bucket(seed, attr)
	cumulative := 0
	for _, v := range r.Variants {
		cumulative += v.Weight
		if int(bucket) < cumulative {
			return v.Key, v.Value
		}
	}
	last := r.Variants[len(r.Variants)-1]
	return last.Key, last.Value
}

func rolloutHits(r Rollout, hashVersion int, ctx Context) bool {
	if r.Percentage <= 0 {
		return false
	}
	if r.Percentage >= 100 {
		return true
	}
	attr := rolloutAttr(r.By, ctx)
	if attr == "" {
		return false
	}
	seed := r.Seed
	if hashVersion > 0 {
		seed = seed + "|v" + strconv.Itoa(hashVersion)
	}
	return int(Bucket(seed, attr)) < r.Percentage
}

func rolloutAttr(by string, ctx Context) string {
	switch by {
	case "user_id", "userId", "user":
		return ctx.UserID
	case "project":
		return ctx.Project
	case "env":
		return ctx.Env
	default:
		return ctx.Attrs[by]
	}
}

func constraintMatches(c AttrConstraint, ctx Context) bool {
	lhs, present := lookupAttr(c.Attr, ctx)
	switch c.Op {
	case "exists":
		return present
	case "not_exists":
		return !present
	case "eq":
		return lhs == c.Value
	case "ne":
		return lhs != c.Value
	case "contains":
		return strings.Contains(lhs, c.Value)
	case "starts_with":
		return strings.HasPrefix(lhs, c.Value)
	case "ends_with":
		return strings.HasSuffix(lhs, c.Value)
	case "regex":
		re, err := regexp.Compile(c.Value)
		if err != nil {
			return false
		}
		return re.MatchString(lhs)
	case "gt", "gte", "lt", "lte":
		a, err1 := strconv.ParseFloat(lhs, 64)
		b, err2 := strconv.ParseFloat(c.Value, 64)
		if err1 != nil || err2 != nil {
			return false
		}
		switch c.Op {
		case "gt":
			return a > b
		case "gte":
			return a >= b
		case "lt":
			return a < b
		case "lte":
			return a <= b
		}
	case "semver_gte":
		return semverCompare(lhs, c.Value) >= 0
	case "semver_lte":
		return semverCompare(lhs, c.Value) <= 0
	}
	return false
}

func lookupAttr(name string, ctx Context) (string, bool) {
	switch name {
	case "user_id", "userId", "user":
		return ctx.UserID, ctx.UserID != ""
	case "env":
		return ctx.Env, ctx.Env != ""
	case "project":
		return ctx.Project, ctx.Project != ""
	}
	if ctx.Attrs == nil {
		return "", false
	}
	v, ok := ctx.Attrs[name]
	return v, ok
}

func semverCompare(a, b string) int {
	pa := semverSplit(a)
	pb := semverSplit(b)
	for i := 0; i < 3; i++ {
		if pa[i] < pb[i] {
			return -1
		}
		if pa[i] > pb[i] {
			return 1
		}
	}
	return 0
}

func semverSplit(v string) [3]int {
	parts := strings.SplitN(v, ".", 4)
	var out [3]int
	for i := 0; i < 3 && i < len(parts); i++ {
		seg := parts[i]
		for j, ch := range seg {
			if ch < '0' || ch > '9' {
				seg = seg[:j]
				break
			}
		}
		if seg == "" {
			continue
		}
		n, err := strconv.Atoi(seg)
		if err != nil {
			continue
		}
		out[i] = n
	}
	return out
}

// Bucket returns the FNV-1a 32-bit hash of seed+"|"+attr modulo 100.
// Exported so tests and the TypeScript / Swift ports can pin parity.
func Bucket(seed, attr string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(seed))
	_, _ = h.Write([]byte("|"))
	_, _ = h.Write([]byte(attr))
	return h.Sum32() % 100
}

func killDatePassed(killDate string, now time.Time) (bool, error) {
	d, err := time.Parse("2006-01-02", killDate)
	if err != nil {
		return false, fmt.Errorf("flageval: invalid killDate %q: %w", killDate, err)
	}
	if now.IsZero() {
		now = time.Now()
	}
	end := d.AddDate(0, 0, 1)
	return !now.Before(end), nil
}

func killZero(t FlagType) json.RawMessage {
	switch t {
	case TypeBool:
		return json.RawMessage(`false`)
	case TypeString:
		return json.RawMessage(`""`)
	case TypeNumber:
		return json.RawMessage(`0`)
	case TypeJSON:
		return json.RawMessage(`null`)
	}
	return json.RawMessage(`null`)
}

func ruleReason(r Rule, idx int) string {
	if r.Description != "" {
		return fmt.Sprintf("rule[%d]: %s", idx, r.Description)
	}
	if r.Rollout != nil {
		return fmt.Sprintf("rule[%d]: rollout %d%% by %s", idx, r.Rollout.Percentage, r.Rollout.By)
	}
	if r.If != nil {
		return fmt.Sprintf("rule[%d]: predicate matched", idx)
	}
	if r.Prereq != nil {
		return fmt.Sprintf("rule[%d]: prereq %s satisfied", idx, r.Prereq.Key)
	}
	return fmt.Sprintf("rule[%d]: matched", idx)
}

func inSlice(xs []string, want string) bool {
	for _, x := range xs {
		if x == want {
			return true
		}
	}
	return false
}

func rawJSONEqual(a, b json.RawMessage) bool {
	var av, bv any
	if err := json.Unmarshal(a, &av); err != nil {
		return false
	}
	if err := json.Unmarshal(b, &bv); err != nil {
		return false
	}
	return deepEqualJSON(av, bv)
}

func deepEqualJSON(a, b any) bool {
	switch av := a.(type) {
	case nil:
		return b == nil
	case bool:
		bv, ok := b.(bool)
		return ok && av == bv
	case float64:
		bv, ok := b.(float64)
		return ok && av == bv
	case string:
		bv, ok := b.(string)
		return ok && av == bv
	case []any:
		bv, ok := b.([]any)
		if !ok || len(av) != len(bv) {
			return false
		}
		for i := range av {
			if !deepEqualJSON(av[i], bv[i]) {
				return false
			}
		}
		return true
	case map[string]any:
		bv, ok := b.(map[string]any)
		if !ok || len(av) != len(bv) {
			return false
		}
		for k, va := range av {
			vb, present := bv[k]
			if !present || !deepEqualJSON(va, vb) {
				return false
			}
		}
		return true
	}
	return false
}
