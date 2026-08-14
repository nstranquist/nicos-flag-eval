package flageval

import (
	"encoding/json"
	"testing"
	"time"
)

func boolFlag(key string, def bool, rules ...Rule) Flag {
	d := json.RawMessage(`false`)
	if def {
		d = json.RawMessage(`true`)
	}
	return Flag{Key: key, Type: TypeBool, Default: d, Scope: ScopeCrossProject, Rules: rules}
}

func TestEvaluator_DefaultWhenNoRules(t *testing.T) {
	e := &Evaluator{}
	r := e.Evaluate(boolFlag("promo", false), Context{})
	if r.Source != SourceDefault || string(r.Value) != "false" {
		t.Fatalf("want default false, got %+v", r)
	}
}

func TestEvaluator_PredicateMatch(t *testing.T) {
	e := &Evaluator{}
	f := boolFlag("promo", false,
		Rule{If: &Predicate{Env: "staging"}, Value: json.RawMessage(`true`)},
	)
	if got := e.Evaluate(f, Context{Env: "staging"}); got.Source != SourceRule || string(got.Value) != "true" {
		t.Fatalf("staging should match: %+v", got)
	}
	if got := e.Evaluate(f, Context{Env: "production"}); got.Source != SourceDefault {
		t.Fatalf("production should fall through to default: %+v", got)
	}
}

func TestEvaluator_RolloutDeterministic(t *testing.T) {
	e := &Evaluator{}
	f := boolFlag("rollout-25", false,
		Rule{Rollout: &Rollout{Seed: "salt-A", Percentage: 25, By: "user_id"}, Value: json.RawMessage(`true`)},
	)
	hit := 0
	const N = 10000
	for i := 0; i < N; i++ {
		ctx := Context{UserID: idString(i)}
		got := e.Evaluate(f, ctx)
		if string(got.Value) == "true" {
			hit++
		}
	}
	if hit < 2300 || hit > 2700 {
		t.Fatalf("rollout drift: hit=%d/%d", hit, N)
	}

	for i := 0; i < 100; i++ {
		got1 := e.Evaluate(f, Context{UserID: "alice"})
		got2 := e.Evaluate(f, Context{UserID: "alice"})
		if string(got1.Value) != string(got2.Value) {
			t.Fatalf("non-deterministic eval for alice: %s vs %s", got1.Value, got2.Value)
		}
	}
}

func TestEvaluator_RolloutZeroAndHundred(t *testing.T) {
	e := &Evaluator{}
	zero := boolFlag("zero", false,
		Rule{Rollout: &Rollout{Seed: "s", Percentage: 0, By: "user_id"}, Value: json.RawMessage(`true`)},
	)
	full := boolFlag("full", false,
		Rule{Rollout: &Rollout{Seed: "s", Percentage: 100, By: "user_id"}, Value: json.RawMessage(`true`)},
	)
	for _, name := range []string{"a", "b", "c"} {
		if got := e.Evaluate(zero, Context{UserID: name}); string(got.Value) != "false" {
			t.Fatalf("0%% should never hit (%s): %+v", name, got)
		}
		if got := e.Evaluate(full, Context{UserID: name}); string(got.Value) != "true" {
			t.Fatalf("100%% should always hit (%s): %+v", name, got)
		}
	}
}

func TestEvaluator_PredicateCombinators(t *testing.T) {
	e := &Evaluator{}
	f := boolFlag("combo", false,
		Rule{If: &Predicate{All: []Predicate{
			{Env: "staging"},
			{Any: []Predicate{{UserID: "alice"}, {UserID: "bob"}}},
			{Not: &Predicate{Project: "frozen"}},
		}}, Value: json.RawMessage(`true`)},
	)
	type tc struct {
		ctx  Context
		want bool
	}
	cases := []tc{
		{Context{Env: "staging", UserID: "alice", Project: "live"}, true},
		{Context{Env: "staging", UserID: "alice", Project: "frozen"}, false},
		{Context{Env: "production", UserID: "alice", Project: "live"}, false},
		{Context{Env: "staging", UserID: "carol", Project: "live"}, false},
	}
	for _, c := range cases {
		got := e.Evaluate(f, c.ctx)
		hit := string(got.Value) == "true"
		if hit != c.want {
			t.Fatalf("combo(%+v) = %s, want hit=%t", c.ctx, got.Value, c.want)
		}
	}
}

func TestEvaluator_KillDate(t *testing.T) {
	e := &Evaluator{}
	f := boolFlag("killable", true)
	f.KillDate = "2026-05-01"

	before := time.Date(2026, 4, 30, 23, 59, 0, 0, time.UTC)
	if got := e.Evaluate(f, Context{Now: before}); got.Source != SourceDefault || string(got.Value) != "true" {
		t.Fatalf("before kill date should hit default true: %+v", got)
	}

	after := time.Date(2026, 5, 2, 0, 0, 1, 0, time.UTC)
	got := e.Evaluate(f, Context{Now: after})
	if got.Source != SourceKillDate || string(got.Value) != "false" {
		t.Fatalf("after kill date should kill to false: %+v", got)
	}
}

func TestEvaluator_RulesShortCircuit(t *testing.T) {
	e := &Evaluator{}
	f := boolFlag("first-match", false,
		Rule{Description: "alpha", If: &Predicate{Env: "x"}, Value: json.RawMessage(`true`)},
		Rule{Description: "beta", If: &Predicate{Env: "x"}, Value: json.RawMessage(`false`)},
	)
	got := e.Evaluate(f, Context{Env: "x"})
	if got.Rule != 1 || string(got.Value) != "true" {
		t.Fatalf("first rule should win: %+v", got)
	}
}

func TestBucket_StableAcrossCalls(t *testing.T) {
	for i := 0; i < 100; i++ {
		if Bucket("seed-x", "alice") != Bucket("seed-x", "alice") {
			t.Fatalf("non-stable hash")
		}
	}
	got := Bucket("seed-x", "alice")
	if got >= 100 {
		t.Fatalf("bucket out of range: %d", got)
	}
}

func idString(i int) string {
	return "user-" + intToStr(i)
}

func intToStr(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}
