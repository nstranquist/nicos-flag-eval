import Foundation

struct ParityRow: Codable {
    let seed: String
    let attr: String
    let expected: UInt32
}

struct ParityFile: Codable {
    let bucket: [ParityRow]
}

@main
struct ParityMain {
    static func main() throws {
        let root: URL
        if CommandLine.arguments.count > 1 {
            root = URL(fileURLWithPath: CommandLine.arguments[1])
        } else {
            root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        }
        let data = try Data(contentsOf: root.appendingPathComponent("schemas/parity-fixture.json"))
        let doc = try JSONDecoder().decode(ParityFile.self, from: data)
        var failed = 0
        for row in doc.bucket {
            let got = bucket(seed: row.seed, attr: row.attr)
            let ok = got == row.expected
            if !ok { failed += 1 }
            print("swift \(ok ? "ok" : "FAIL") seed=\(row.seed.debugDescription) attr=\(row.attr.debugDescription) got=\(got) expected=\(row.expected)")
        }
        if failed > 0 {
            fputs("swift parity failures: \(failed)\n", stderr)
            exit(1)
        }
        print("swift parity tuples=\(doc.bucket.count) status=ok")
    }
}
