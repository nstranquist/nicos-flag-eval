package flageval

import (
	"path/filepath"
	"runtime"
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
