package main

import (
	"fmt"
	"os"
	"path/filepath"

	flageval "github.com/nstranquist/nicos-flag-eval"
)

func main() {
	root, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "cwd: %v\n", err)
		os.Exit(1)
	}
	path := filepath.Join(root, "schemas", "demo.manifest.json")
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	m, err := flageval.LoadManifest(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "load: %v\n", err)
		os.Exit(1)
	}
	res := m.Evaluate("checkout.promo-banner", flageval.Context{
		UserID: "user-alice",
		Env:    "staging",
	})
	if !res.Found || len(res.Value) == 0 || res.Source == "" {
		fmt.Fprintf(os.Stderr, "empty result: %+v\n", res)
		os.Exit(1)
	}
	fmt.Printf("key=%s value=%s source=%s\n", res.Key, string(res.Value), res.Source)
}
