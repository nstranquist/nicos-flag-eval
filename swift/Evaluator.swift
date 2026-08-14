// Portable Swift port of the Go flageval engine.
//
// Same FNV-1a 32-bit bucketing, same predicate combinators, same rule
// short-circuit, same kill-date semantics.

import Foundation

public enum FlagType: String, Codable, Sendable {
    case boolean
    case string
    case number
    case json
}

public enum FlagScope: String, Codable, Sendable {
    case crossProject = "cross-project"
}

public enum FlagValue: Codable, Sendable, Equatable {
    case bool(Bool)
    case string(String)
    case number(Double)
    case array([FlagValue])
    case object([String: FlagValue])
    case null

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let n = try? c.decode(Double.self) { self = .number(n); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([FlagValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: FlagValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "FlagValue: unsupported JSON shape")
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .bool(let b): try c.encode(b)
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        case .null: try c.encodeNil()
        }
    }

    public var debugText: String {
        switch self {
        case .bool(let b): return b ? "true" : "false"
        case .string(let s): return s
        case .number(let n): return String(n)
        case .array: return "[array]"
        case .object: return "{object}"
        case .null: return "null"
        }
    }
}

public struct Predicate: Codable, Sendable {
    public var env: String?
    public var envs: [String]?
    public var project: String?
    public var projects: [String]?
    public var userId: String?
    public var userIdIn: [String]?
    public var attr: [String: String]?
    public var constraints: [AttrConstraint]?
    public var all: [Predicate]?
    public var any: [Predicate]?
    public var not: Box?

    public init(all: [Predicate]) {
        self.all = all
    }

    public final class Box: Codable, Sendable {
        public let p: Predicate
        public init(_ p: Predicate) { self.p = p }
        public init(from decoder: Decoder) throws { p = try Predicate(from: decoder) }
        public func encode(to encoder: Encoder) throws { try p.encode(to: encoder) }
    }
}

public struct AttrConstraint: Codable, Sendable {
    public let attr: String
    public let op: String
    public var value: String?
}

public struct Prereq: Codable, Sendable {
    public let key: String
    public let equals: FlagValue
}

public struct Rollout: Codable, Sendable {
    public let seed: String
    public let percentage: Int
    public let by: String
}

public struct Rule: Codable, Sendable {
    public var description: String?
    public var ifPred: Predicate?
    public var prereq: Prereq?
    public var rollout: Rollout?
    public var value: FlagValue?
    public var variants: [Variant]?
    public var segment: String?

    enum CodingKeys: String, CodingKey {
        case description
        case ifPred = "if"
        case prereq
        case rollout
        case value
        case variants
        case segment
    }
}

public struct SegmentSpec: Codable, Sendable {
    public let key: String
    public var description: String?
    public var predicate: Predicate
}

public struct Variant: Codable, Sendable {
    public let key: String
    public let weight: Int
    public var value: FlagValue?
}

public struct FlagSpec: Codable, Sendable {
    public let key: String
    public let type: FlagType
    public let `default`: FlagValue
    public let scope: FlagScope
    public var owner: String?
    public var description: String?
    public var tags: [String]?
    public var exposedIn: [String]?
    public var envVar: String?
    public var killDate: String?
    public var killValue: FlagValue?
    public var rules: [Rule]?
    public var hashVersion: Int?
    public var namespace: String?
    public var namespaceRange: [Double]?
}

public struct FlagsManifest: Codable, Sendable {
    public let schemaVersion: Int
    public let flags: [FlagSpec]
    public var segments: [SegmentSpec]?
}

public struct EvalContext: Sendable {
    public var userId: String?
    public var env: String?
    public var project: String?
    public var attrs: [String: String]?
    public var now: Date?
    public var overrides: [String: FlagValue]?
    public var processOverrides: [String: FlagValue]?
    public init(userId: String? = nil, env: String? = nil, project: String? = nil,
                attrs: [String: String]? = nil, now: Date? = nil,
                overrides: [String: FlagValue]? = nil,
                processOverrides: [String: FlagValue]? = nil) {
        self.userId = userId; self.env = env; self.project = project
        self.attrs = attrs; self.now = now
        self.overrides = overrides; self.processOverrides = processOverrides
    }
}

public enum EvalSource: String, Sendable {
    case processFlag = "process-flag"
    case personalOverride = "personal-override"
    case repoOverride = "repo-override"
    case rule
    case killDate = "kill-date"
    case `default`
    case missing
}

public struct EvalResult: Sendable {
    public let key: String
    public let value: FlagValue
    public let source: EvalSource
    public let reason: String
    public let rule: Int?
    public let variant: String?
    public let found: Bool
}

public final class Evaluator: @unchecked Sendable {
    private let byKey: [String: FlagSpec]

    public init(manifest: FlagsManifest) throws {
        let prepared = try prepareManifest(manifest)
        var m: [String: FlagSpec] = [:]
        for f in prepared.flags { m[f.key] = f }
        self.byKey = m
    }

    public func evaluate(_ key: String, _ ctx: EvalContext = EvalContext()) -> EvalResult {
        return evaluate(key, ctx, visiting: [])
    }

    private func evaluate(_ key: String, _ ctx: EvalContext, visiting: Set<String>) -> EvalResult {
        if visiting.contains(key) {
            return EvalResult(key: key, value: .null, source: .missing,
                              reason: "cyclic prerequisite", rule: nil, variant: nil, found: false)
        }
        guard let f = byKey[key] else {
            return EvalResult(key: key, value: .null, source: .missing,
                              reason: "flag not registered", rule: nil, variant: nil, found: false)
        }
        var nextVisit = visiting
        nextVisit.insert(key)
        if let po = ctx.processOverrides, let v = po[key] {
            return EvalResult(key: key, value: v, source: .processFlag,
                              reason: "in-memory process override", rule: nil, variant: nil, found: true)
        }
        if let ov = ctx.overrides, let v = ov[key] {
            return EvalResult(key: key, value: v, source: .personalOverride,
                              reason: "in-memory override", rule: nil, variant: nil, found: true)
        }
        if let rules = f.rules {
            for (i, r) in rules.enumerated() {
                if !ruleMatches(f, r, ctx, visiting: nextVisit) { continue }
                var v: FlagValue = r.value ?? f.default
                var variantKey: String? = nil
                if let vs = r.variants, !vs.isEmpty {
                    let picked = Evaluator.pickVariant(flagKey: key, hashVersion: f.hashVersion ?? 0, ruleIdx: i, rule: r, ctx: ctx)
                    variantKey = picked.key
                    v = picked.value ?? f.default
                }
                return EvalResult(key: key, value: v, source: .rule,
                                  reason: ruleReason(r, i), rule: i + 1,
                                  variant: variantKey, found: true)
            }
        }
        if let kd = f.killDate, killDatePassed(kd, ctx.now) {
            let v = f.killValue ?? killZero(f.type)
            return EvalResult(key: key, value: v, source: .killDate,
                              reason: "kill date \(kd) passed", rule: nil,
                              variant: nil, found: true)
        }
        return EvalResult(key: key, value: f.default, source: .default,
                          reason: "no rule matched", rule: nil,
                          variant: nil, found: true)
    }

    static func pickVariant(flagKey: String, hashVersion: Int, ruleIdx: Int, rule r: Rule, ctx: EvalContext) -> (key: String, value: FlagValue?) {
        let variants = r.variants ?? []
        var seed: String
        let attr: String
        if let ro = r.rollout, !ro.seed.isEmpty {
            seed = ro.seed
            attr = rolloutAttr(ro.by, ctx)
        } else {
            seed = "\(flagKey)|rule-\(ruleIdx)"
            attr = ctx.userId ?? ctx.project ?? ctx.env ?? ""
        }
        if hashVersion > 0 { seed = seed + "|v\(hashVersion)" }
        let b = Int(bucket(seed: seed, attr: attr))
        var cumulative = 0
        for v in variants {
            cumulative += v.weight
            if b < cumulative { return (v.key, v.value) }
        }
        guard let last = variants.last else { return ("", nil) }
        return (last.key, last.value)
    }

    private func ruleMatches(_ f: FlagSpec, _ r: Rule, _ ctx: EvalContext, visiting: Set<String>) -> Bool {
        if let p = r.ifPred, !predicateMatches(p, ctx) { return false }
        if let pr = r.prereq {
            let got = evaluate(pr.key, ctx, visiting: visiting)
            if !got.found || got.value != pr.equals { return false }
        }
        if let ro = r.rollout, !rolloutHits(ro, f.hashVersion ?? 0, ctx) { return false }
        if f.namespace != nil && !(f.namespace ?? "").isEmpty && !namespaceHits(f, ctx) { return false }
        return true
    }
}

public enum FlagEvalError: Error {
    case unknownSegment(String)
    case duplicateSegment(String)
}

public func prepareManifest(_ manifest: FlagsManifest) throws -> FlagsManifest {
    var segments: [String: Predicate] = [:]
    for seg in manifest.segments ?? [] {
        if segments[seg.key] != nil {
            throw FlagEvalError.duplicateSegment(seg.key)
        }
        segments[seg.key] = seg.predicate
    }
    var flags: [FlagSpec] = []
    for var f in manifest.flags {
        if let rules = f.rules {
            var next: [Rule] = []
            for var r in rules {
                if let name = r.segment, !name.isEmpty {
                    guard let pred = segments[name] else {
                        throw FlagEvalError.unknownSegment(name)
                    }
                    if let existing = r.ifPred {
                        r.ifPred = Predicate(all: [existing, pred])
                    } else {
                        r.ifPred = pred
                    }
                    r.segment = nil
                }
                next.append(r)
            }
            f.rules = next
        }
        flags.append(f)
    }
    return FlagsManifest(schemaVersion: manifest.schemaVersion, flags: flags, segments: nil)
}

public func namespaceHits(_ f: FlagSpec, _ ctx: EvalContext) -> Bool {
    guard let user = ctx.userId, !user.isEmpty else { return false }
    let range = f.namespaceRange ?? [0, 1]
    guard range.count == 2 else { return false }
    let b = Double(bucket(seed: "ns:" + (f.namespace ?? ""), attr: user)) / 100.0
    return b >= range[0] && b < range[1]
}

public func predicateMatches(_ p: Predicate, _ ctx: EvalContext) -> Bool {
    if let e = p.env, e != (ctx.env ?? "") { return false }
    if let es = p.envs, !es.contains(ctx.env ?? "") { return false }
    if let pr = p.project, pr != (ctx.project ?? "") { return false }
    if let ps = p.projects, !ps.contains(ctx.project ?? "") { return false }
    if let u = p.userId, u != (ctx.userId ?? "") { return false }
    if let us = p.userIdIn, !us.contains(ctx.userId ?? "") { return false }
    if let attr = p.attr {
        for (k, v) in attr where (ctx.attrs?[k] ?? "") != v { return false }
    }
    if let cs = p.constraints {
        for c in cs where !constraintMatches(c, ctx) { return false }
    }
    if let all = p.all, !all.allSatisfy({ predicateMatches($0, ctx) }) { return false }
    if let any = p.any, !any.contains(where: { predicateMatches($0, ctx) }) { return false }
    if let not = p.not?.p, predicateMatches(not, ctx) { return false }
    return true
}

public func rolloutHits(_ r: Rollout, _ hashVersion: Int, _ ctx: EvalContext) -> Bool {
    if r.percentage <= 0 { return false }
    if r.percentage >= 100 { return true }
    let attr = rolloutAttr(r.by, ctx)
    if attr.isEmpty { return false }
    var seed = r.seed
    if hashVersion > 0 { seed = seed + "|v\(hashVersion)" }
    return Int(bucket(seed: seed, attr: attr)) < r.percentage
}

func rolloutAttr(_ by: String, _ ctx: EvalContext) -> String {
    switch by {
    case "user_id", "userId", "user": return ctx.userId ?? ""
    case "project": return ctx.project ?? ""
    case "env": return ctx.env ?? ""
    default: return ctx.attrs?[by] ?? ""
    }
}

/// FNV-1a 32-bit of `seed + "|" + attr`, modulo 100. Cross-language stable.
public func bucket(seed: String, attr: String) -> UInt32 {
    let input = (seed + "|" + attr).utf8
    var hash: UInt32 = 0x811c9dc5
    for b in input {
        hash ^= UInt32(b)
        hash = hash &* 0x01000193
    }
    return hash % 100
}

private func killDatePassed(_ killDate: String, _ now: Date?) -> Bool {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    f.timeZone = TimeZone(identifier: "UTC")
    guard let d = f.date(from: killDate) else { return false }
    let end = d.addingTimeInterval(24 * 60 * 60)
    return (now ?? Date()) >= end
}

private func killZero(_ t: FlagType) -> FlagValue {
    switch t {
    case .boolean: return .bool(false)
    case .string: return .string("")
    case .number: return .number(0)
    case .json: return .null
    }
}

public func constraintMatches(_ c: AttrConstraint, _ ctx: EvalContext) -> Bool {
    let (lhs, present) = lookupAttr(c.attr, ctx)
    let v = c.value ?? ""
    switch c.op {
    case "exists":     return present
    case "not_exists": return !present
    case "eq":         return lhs == v
    case "ne":         return lhs != v
    case "contains":   return lhs.contains(v)
    case "starts_with": return lhs.hasPrefix(v)
    case "ends_with":  return lhs.hasSuffix(v)
    case "regex":
        guard let re = try? NSRegularExpression(pattern: v) else { return false }
        let range = NSRange(lhs.startIndex..., in: lhs)
        return re.firstMatch(in: lhs, range: range) != nil
    case "gt", "gte", "lt", "lte":
        guard let a = Double(lhs), let b = Double(v) else { return false }
        switch c.op {
        case "gt":  return a > b
        case "gte": return a >= b
        case "lt":  return a < b
        case "lte": return a <= b
        default:    return false
        }
    case "semver_gte": return semverCompare(lhs, v) >= 0
    case "semver_lte": return semverCompare(lhs, v) <= 0
    default: return false
    }
}

private func lookupAttr(_ name: String, _ ctx: EvalContext) -> (String, Bool) {
    switch name {
    case "user_id", "userId", "user":
        let s = ctx.userId ?? ""
        return (s, !s.isEmpty)
    case "env":
        let s = ctx.env ?? ""
        return (s, !s.isEmpty)
    case "project":
        let s = ctx.project ?? ""
        return (s, !s.isEmpty)
    default:
        if let v = ctx.attrs?[name] { return (v, true) }
        return ("", false)
    }
}

private func semverCompare(_ a: String, _ b: String) -> Int {
    let pa = semverSplit(a)
    let pb = semverSplit(b)
    for i in 0..<3 {
        if pa[i] < pb[i] { return -1 }
        if pa[i] > pb[i] { return 1 }
    }
    return 0
}

private func semverSplit(_ v: String) -> [Int] {
    let parts = v.split(separator: ".", maxSplits: 3, omittingEmptySubsequences: false)
    var out = [0, 0, 0]
    for i in 0..<min(3, parts.count) {
        var seg = String(parts[i])
        if let idx = seg.firstIndex(where: { !$0.isNumber }) {
            seg = String(seg[..<idx])
        }
        if seg.isEmpty { continue }
        if let n = Int(seg) { out[i] = n }
    }
    return out
}

private func ruleReason(_ r: Rule, _ idx: Int) -> String {
    if let d = r.description { return "rule[\(idx)]: \(d)" }
    if let ro = r.rollout { return "rule[\(idx)]: rollout \(ro.percentage)% by \(ro.by)" }
    if r.ifPred != nil { return "rule[\(idx)]: predicate matched" }
    if let pr = r.prereq { return "rule[\(idx)]: prereq \(pr.key) satisfied" }
    return "rule[\(idx)]: matched"
}
