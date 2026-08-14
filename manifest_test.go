package flageval

import (
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestManifest_EvaluateDemoPromoBanner(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	path := filepath.Join(filepath.Dir(file), "schemas", "demo.manifest.json")
	m, err := LoadManifest(path)
	if err != nil {
		t.Fatalf("LoadManifest: %v", err)
	}

	got := m.Evaluate("checkout.promo-banner", Context{UserID: "user-alice", Env: "staging"})
	if !got.Found {
		t.Fatalf("expected found result: %+v", got)
	}
	if got.Source != SourceRule {
		t.Fatalf("source = %s, want %s", got.Source, SourceRule)
	}
	if string(got.Value) != "true" {
		t.Fatalf("value = %s, want true", got.Value)
	}

	missing := m.Evaluate("missing.flag", Context{})
	if missing.Found || missing.Source != SourceMissing {
		t.Fatalf("missing flag: %+v", missing)
	}
}

func contractManifest(t *testing.T) Manifest {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	path := filepath.Join(filepath.Dir(file), "testdata", "contract.manifest.json")
	m, err := LoadManifest(path)
	if err != nil {
		t.Fatalf("LoadManifest contract: %v", err)
	}
	return m
}

func TestManifest_SegmentInlinedAtLoad(t *testing.T) {
	m := contractManifest(t)
	f, ok := m.Flag("checkout.vip-banner")
	if !ok {
		t.Fatal("missing checkout.vip-banner")
	}
	if len(f.Rules) != 1 || f.Rules[0].Segment != "" {
		t.Fatalf("segment ref should be cleared: %+v", f.Rules[0])
	}
	if f.Rules[0].If == nil || f.Rules[0].If.Attr["plan"] != "vip" {
		t.Fatalf("segment predicate should be inlined: %+v", f.Rules[0].If)
	}

	vip := m.Evaluate("checkout.vip-banner", Context{Attrs: map[string]string{"plan": "vip"}})
	if vip.Source != SourceRule || string(vip.Value) != "true" {
		t.Fatalf("vip should match: %+v", vip)
	}
	other := m.Evaluate("checkout.vip-banner", Context{Attrs: map[string]string{"plan": "free"}})
	if other.Source != SourceDefault || string(other.Value) != "false" {
		t.Fatalf("non-vip should miss: %+v", other)
	}
}

func TestManifest_UnknownSegmentRejected(t *testing.T) {
	_, err := ParseManifest([]byte(`{
		"schemaVersion": 1,
		"flags": [{
			"key": "x.flag",
			"type": "boolean",
			"default": false,
			"scope": "cross-project",
			"rules": [{"segment": "missing-seg", "value": true}]
		}]
	}`))
	if err == nil || !strings.Contains(err.Error(), "unknown segment") {
		t.Fatalf("want unknown-segment error, got %v", err)
	}
}

func TestManifest_CyclicPrereqFailsClosed(t *testing.T) {
	m := contractManifest(t)
	got := m.Evaluate("cycle.alpha", Context{UserID: "user-alice"})
	if got.Source != SourceDefault || string(got.Value) != "false" {
		t.Fatalf("cyclic prereq must fail closed to default: %+v", got)
	}
}

func TestManifest_HashVersionAndNamespace(t *testing.T) {
	m := contractManifest(t)
	ctx := Context{UserID: "user-alice"}
	got := m.Evaluate("search.reshuffle", ctx)
	wantHit := int(Bucket("search.reshuffle|v1", "user-alice")) < 50
	hit := string(got.Value) == "true"
	if hit != wantHit {
		t.Fatalf("hashVersion=1 rollout: value=%s source=%s wantHit=%t bucket=%d",
			got.Value, got.Source, wantHit, Bucket("search.reshuffle|v1", "user-alice"))
	}

	left := m.Evaluate("exp.left", ctx)
	right := m.Evaluate("exp.right", ctx)
	leftOn := string(left.Value) == "true"
	rightOn := string(right.Value) == "true"
	if leftOn && rightOn {
		t.Fatal("disjoint namespace ranges both hit")
	}
	if !leftOn && !rightOn {
		t.Fatal("user-alice missed both namespace ranges")
	}
}

func TestManifest_SiblingPrereqRules(t *testing.T) {
	m := contractManifest(t)
	got := m.Evaluate("path.flag", Context{})
	if got.Source != SourceRule || string(got.Value) != `"off"` {
		t.Fatalf("second sibling prereq should win: %+v", got)
	}
}

func TestManifest_OverlappingNamespacesRejected(t *testing.T) {
	_, err := ParseManifest([]byte(`{
		"schemaVersion": 1,
		"flags": [
			{
				"key": "exp.one",
				"type": "boolean",
				"default": false,
				"scope": "cross-project",
				"namespace": "ab",
				"namespaceRange": [0, 0.6],
				"rules": [{"value": true}]
			},
			{
				"key": "exp.two",
				"type": "boolean",
				"default": false,
				"scope": "cross-project",
				"namespace": "ab",
				"namespaceRange": [0.4, 1],
				"rules": [{"value": true}]
			}
		]
	}`))
	if err == nil || !strings.Contains(err.Error(), "overlaps") {
		t.Fatalf("want overlap error, got %v", err)
	}
}
