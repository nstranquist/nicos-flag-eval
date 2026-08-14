package flageval

import (
	"encoding/json"
	"time"
)

// Scope classifies a flag's audience. The portable extract only authors
// project-scoped flags. Factory-only scopes stay out of this tree.
type Scope string

const (
	ScopeCrossProject Scope = "cross-project"
)

// FlagType is the wire type of a flag's value. Matches JSON primitives.
type FlagType string

const (
	TypeBool   FlagType = "boolean"
	TypeString FlagType = "string"
	TypeNumber FlagType = "number"
	TypeJSON   FlagType = "json"
)

// Flag is the spec of a single feature flag.
type Flag struct {
	Key         string          `json:"key"`
	Type        FlagType        `json:"type"`
	Default     json.RawMessage `json:"default"`
	Scope       Scope           `json:"scope"`
	Owner       string          `json:"owner,omitempty"`
	Description string          `json:"description,omitempty"`
	Tags        []string        `json:"tags,omitempty"`
	ExposedIn   []string        `json:"exposedIn,omitempty"`
	EnvVar      string          `json:"envVar,omitempty"`
	KillDate    string          `json:"killDate,omitempty"`
	KillValue   json.RawMessage `json:"killValue,omitempty"`
	Rules       []Rule          `json:"rules,omitempty"`

	// ForceInclude maps a user id to a variation that wins over rule eval.
	ForceInclude map[string]json.RawMessage `json:"force_include,omitempty"`

	// ForceExclude forces the flag back to its manifest Default.
	ForceExclude []string `json:"force_exclude,omitempty"`

	// HashVersion is folded into the FNV-1a bucket seed so bumping it
	// reshuffles assignments.
	HashVersion int `json:"hashVersion,omitempty"`

	// StickyBucketing is a schema hint for hosts. The evaluator is pure
	// and does not persist assignments.
	StickyBucketing bool `json:"stickyBucketing,omitempty"`

	// Namespace pins the flag to a named bucket space.
	Namespace string `json:"namespace,omitempty"`

	// NamespaceRange is the [start, end) window inside Namespace.
	NamespaceRange [2]float64 `json:"namespaceRange,omitempty"`

	// Schema is an optional JSON Schema for type=json values.
	Schema json.RawMessage `json:"schema,omitempty"`
}

// Rule is a single targeting rule. Rules are evaluated top-to-bottom;
// the first rule whose predicate (and prereq, and rollout) pass returns
// its Value — or, when Variants is set, the variant chosen by weighted
// bucketing.
type Rule struct {
	Description string          `json:"description,omitempty"`
	If          *Predicate      `json:"if,omitempty"`
	Prereq      *Prereq         `json:"prereq,omitempty"`
	Rollout     *Rollout        `json:"rollout,omitempty"`
	Value       json.RawMessage `json:"value,omitempty"`
	Variants    []Variant       `json:"variants,omitempty"`
	Segment     string          `json:"segment,omitempty"`
}

// Segment is a named reusable audience.
type Segment struct {
	Key         string    `json:"key"`
	Description string    `json:"description,omitempty"`
	Predicate   Predicate `json:"predicate"`
}

// Variant is one arm of a multivariate experiment.
type Variant struct {
	Key    string          `json:"key"`
	Weight int             `json:"weight"`
	Value  json.RawMessage `json:"value,omitempty"`
}

// Predicate is a boolean expression over the eval Context.
// Within one Predicate, every set field must match (implicit AND). The
// all / any / not combinators compose nested predicates.
type Predicate struct {
	Env         string            `json:"env,omitempty"`
	Envs        []string          `json:"envs,omitempty"`
	Project     string            `json:"project,omitempty"`
	Projects    []string          `json:"projects,omitempty"`
	UserID      string            `json:"userId,omitempty"`
	UserIDIn    []string          `json:"userIdIn,omitempty"`
	Attr        map[string]string `json:"attr,omitempty"`
	Constraints []AttrConstraint  `json:"constraints,omitempty"`
	All         []Predicate       `json:"all,omitempty"`
	Any         []Predicate       `json:"any,omitempty"`
	Not         *Predicate        `json:"not,omitempty"`
}

// AttrConstraint is a richer per-attribute predicate.
//
// Supported ops:
//
//   - eq, ne
//   - gt, gte, lt, lte
//   - contains, starts_with, ends_with
//   - regex
//   - exists, not_exists
//   - semver_gte, semver_lte
//
// Parse / regex failures fail-closed (predicate does not match).
type AttrConstraint struct {
	Attr  string `json:"attr"`
	Op    string `json:"op"`
	Value string `json:"value,omitempty"`
}

// Prereq guards a rule on the resolved value of another flag.
type Prereq struct {
	Key    string          `json:"key"`
	Equals json.RawMessage `json:"equals"`
}

// Rollout buckets the Context into [0,100) using
// FNV-1a(seed + "|" + by-attribute) % 100. The rule wins when the bucket
// is strictly less than Percentage.
type Rollout struct {
	Seed       string `json:"seed"`
	Percentage int    `json:"percentage"`
	By         string `json:"by"`
}

// Context is the per-evaluation input. Empty fields are treated as
// unknown — predicates that require them will not match.
type Context struct {
	UserID  string            `json:"userId,omitempty"`
	Env     string            `json:"env,omitempty"`
	Project string            `json:"project,omitempty"`
	Attrs   map[string]string `json:"attrs,omitempty"`
	Now     time.Time         `json:"-"`
}

// Source is the resolution tier that produced an EvalResult.
type Source string

const (
	SourceProcessFlag      Source = "process-flag"
	SourceEnv              Source = "env"
	SourcePersonalOverride Source = "personal-override"
	SourceRepoOverride     Source = "repo-override"
	SourceCloudOverride    Source = "cloud-override"
	SourceStickyBucket     Source = "sticky-bucket"
	SourceForceInclude     Source = "force-include"
	SourceForceExclude     Source = "force-exclude"
	SourceRule             Source = "rule"
	SourceKillDate         Source = "kill-date"
	SourceDefault          Source = "default"
	SourceMissing          Source = "missing"
)

// EvalResult is the typed answer returned by Evaluator and Manifest.
type EvalResult struct {
	Key     string          `json:"key"`
	Value   json.RawMessage `json:"value"`
	Source  Source          `json:"source"`
	Reason  string          `json:"reason"`
	Rule    int             `json:"rule,omitempty"`
	Variant string          `json:"variant,omitempty"`
	Found   bool            `json:"found"`
}
