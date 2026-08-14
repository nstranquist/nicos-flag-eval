import Foundation

@main
struct EvalDemoMain {
    static func main() throws {
        let root: URL
        if CommandLine.arguments.count > 1 {
            root = URL(fileURLWithPath: CommandLine.arguments[1])
        } else {
            root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        }
        let manifestURL = root.appendingPathComponent("schemas/demo.manifest.json")
        let data = try Data(contentsOf: manifestURL)
        let manifest = try JSONDecoder().decode(FlagsManifest.self, from: data)
        let ev = Evaluator(manifest: manifest)
        let res = ev.evaluate("checkout.promo-banner", EvalContext(userId: "user-alice", env: "staging"))
        if !res.found || res.source.rawValue.isEmpty {
            fputs("empty result\n", stderr)
            exit(1)
        }
        print("key=\(res.key) value=\(res.value.debugText) source=\(res.source.rawValue)")
    }
}
