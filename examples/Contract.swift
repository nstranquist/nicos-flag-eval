import Foundation

@main
struct ContractMain {
    static func main() throws {
        let root: URL
        if CommandLine.arguments.count > 1 {
            root = URL(fileURLWithPath: CommandLine.arguments[1])
        } else {
            root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        }
        let data = try Data(contentsOf: root.appendingPathComponent("testdata/contract.manifest.json"))
        let manifest = try JSONDecoder().decode(FlagsManifest.self, from: data)
        let ev = try Evaluator(manifest: manifest)

        let vip = ev.evaluate("checkout.vip-banner", EvalContext(attrs: ["plan": "vip"]))
        guard vip.source == .rule, vip.value.debugText == "true" else {
            fputs("vip segment failed: \(vip.source.rawValue) \(vip.value.debugText)\n", stderr)
            exit(1)
        }
        let other = ev.evaluate("checkout.vip-banner", EvalContext(attrs: ["plan": "free"]))
        guard other.source == .default, other.value.debugText == "false" else {
            fputs("non-vip should miss segment: \(other.source.rawValue)\n", stderr)
            exit(1)
        }

        let cycle = ev.evaluate("cycle.alpha", EvalContext(userId: "user-alice"))
        guard cycle.source == .default, cycle.value.debugText == "false" else {
            fputs("cycle should fail closed: \(cycle.source.rawValue)\n", stderr)
            exit(1)
        }

        let reshuffle = ev.evaluate("search.reshuffle", EvalContext(userId: "user-alice"))
        let wantHit = bucket(seed: "search.reshuffle|v1", attr: "user-alice") < 50
        let hit = reshuffle.value.debugText == "true"
        guard hit == wantHit else {
            fputs("hashVersion rollout mismatch\n", stderr)
            exit(1)
        }

        let left = ev.evaluate("exp.left", EvalContext(userId: "user-alice"))
        let right = ev.evaluate("exp.right", EvalContext(userId: "user-alice"))
        let leftOn = left.value.debugText == "true"
        let rightOn = right.value.debugText == "true"
        guard leftOn != rightOn else {
            fputs("namespace ranges must be exclusive\n", stderr)
            exit(1)
        }

        print("swift contract status=ok")
    }
}
