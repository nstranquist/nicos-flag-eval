package flageval

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

type parityFile struct {
	Bucket []struct {
		Seed     string `json:"seed"`
		Attr     string `json:"attr"`
		Expected uint32 `json:"expected"`
	} `json:"bucket"`
}

func loadParityFixture(t *testing.T) parityFile {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	path := filepath.Join(filepath.Dir(file), "schemas", "parity-fixture.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var doc parityFile
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatalf("decode fixture: %v", err)
	}
	if len(doc.Bucket) != 9 {
		t.Fatalf("fixture must contain the nine frozen tuples, got %d", len(doc.Bucket))
	}
	return doc
}

func TestBucket_ParityFixture(t *testing.T) {
	doc := loadParityFixture(t)
	for _, row := range doc.Bucket {
		got := Bucket(row.Seed, row.Attr)
		if got != row.Expected {
			t.Errorf("Bucket(%q, %q) = %d, fixture expected %d", row.Seed, row.Attr, got, row.Expected)
		}
	}
}
