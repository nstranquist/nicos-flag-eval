package flageval

import (
	"encoding/json"
	"fmt"
)

// validateAgainstSchema runs a minimal in-tree JSON Schema validator
// against a single variation value. Supports the subset of JSON Schema
// draft-07 useful for flag-value validation: type, enum, properties,
// required, items, and additionalProperties: false.
func validateAgainstSchema(schema json.RawMessage, value json.RawMessage) error {
	if len(schema) == 0 {
		return nil
	}
	var schemaDoc map[string]any
	if err := json.Unmarshal(schema, &schemaDoc); err != nil {
		return fmt.Errorf("schema is not a JSON object: %w", err)
	}
	var v any
	if err := json.Unmarshal(value, &v); err != nil {
		return fmt.Errorf("value is not valid JSON: %w", err)
	}
	return validateValue(schemaDoc, v, "")
}

func validateValue(schema map[string]any, v any, path string) error {
	if t, ok := schema["type"].(string); ok {
		if err := checkType(t, v, path); err != nil {
			return err
		}
	}
	if enum, ok := schema["enum"].([]any); ok {
		if !enumContains(enum, v) {
			return fmt.Errorf("%s: value %v not in enum %v", pathOrRoot(path), v, enum)
		}
	}
	switch typed := v.(type) {
	case map[string]any:
		if props, ok := schema["properties"].(map[string]any); ok {
			for name, sub := range props {
				if cv, present := typed[name]; present {
					subDoc, _ := sub.(map[string]any)
					if err := validateValue(subDoc, cv, path+"."+name); err != nil {
						return err
					}
				}
			}
		}
		if req, ok := schema["required"].([]any); ok {
			for _, r := range req {
				name, _ := r.(string)
				if _, present := typed[name]; !present {
					return fmt.Errorf("%s: missing required property %q", pathOrRoot(path), name)
				}
			}
		}
		if ap, ok := schema["additionalProperties"].(bool); ok && !ap {
			if props, ok := schema["properties"].(map[string]any); ok {
				for k := range typed {
					if _, allowed := props[k]; !allowed {
						return fmt.Errorf("%s: additional property %q not allowed", pathOrRoot(path), k)
					}
				}
			}
		}
	case []any:
		if items, ok := schema["items"].(map[string]any); ok {
			for i, item := range typed {
				if err := validateValue(items, item, fmt.Sprintf("%s[%d]", pathOrRoot(path), i)); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func checkType(want string, v any, path string) error {
	ok := false
	switch want {
	case "boolean":
		_, ok = v.(bool)
	case "string":
		_, ok = v.(string)
	case "number", "integer":
		_, ok = v.(float64)
	case "array":
		_, ok = v.([]any)
	case "object":
		_, ok = v.(map[string]any)
	case "null":
		ok = v == nil
	}
	if !ok {
		return fmt.Errorf("%s: expected %s, got %T", pathOrRoot(path), want, v)
	}
	return nil
}

func enumContains(enum []any, v any) bool {
	for _, e := range enum {
		if deepEqualJSON(e, v) {
			return true
		}
	}
	return false
}

func pathOrRoot(p string) string {
	if p == "" {
		return "(root)"
	}
	return p
}
