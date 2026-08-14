package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	flageval "github.com/nstranquist/nicos-flag-eval"
)

type parityFile struct {
	Bucket []struct {
		Seed     string `json:"seed"`
		Attr     string `json:"attr"`
		Expected uint32 `json:"expected"`
	} `json:"bucket"`
}

func main() {
	root, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "cwd: %v\n", err)
		os.Exit(1)
	}
	path := filepath.Join(root, "schemas", "parity-fixture.json")
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read: %v\n", err)
		os.Exit(1)
	}
	var doc parityFile
	if err := json.Unmarshal(raw, &doc); err != nil {
		fmt.Fprintf(os.Stderr, "decode: %v\n", err)
		os.Exit(1)
	}
	failed := 0
	for _, row := range doc.Bucket {
		got := flageval.Bucket(row.Seed, row.Attr)
		ok := got == row.Expected
		status := "ok"
		if !ok {
			status = "FAIL"
			failed++
		}
		fmt.Printf("go %s seed=%q attr=%q got=%d expected=%d\n", status, row.Seed, row.Attr, got, row.Expected)
	}
	if failed > 0 {
		fmt.Fprintf(os.Stderr, "go parity failures: %d\n", failed)
		os.Exit(1)
	}
	fmt.Printf("go parity tuples=%d status=ok\n", len(doc.Bucket))
}
