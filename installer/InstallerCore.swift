import Foundation
import CryptoKit

struct InstallResult { let extensionDirectory: URL; let bridge: URL }
enum SetupError: LocalizedError {
    case invalidPayload(String), installation(String)
    var errorDescription: String? { switch self { case .invalidPayload(let s): return "Paketet kunde inte verifieras: \(s)"; case .installation(let s): return s } }
}
struct InstallerCore {
    static let host = "se.atea.coachpilot"
    static let extensionID = "lfapachncdlijnjdhjblkgcjloceobmj"
    let payload: URL
    let fm = FileManager.default
    func verify() throws {
        let checks = try JSONDecoder().decode([String:String].self, from: Data(contentsOf: payload.appendingPathComponent("checksums.json")))
        let required = ["CoachBridge", "extension/manifest.json", "extension/panel.html", "extension/panel.js", "extension/background.js", "extension/style.css"]
        guard Set(checks.keys) == Set(required) else { throw SetupError.invalidPayload("Felaktig fillista.") }
        for name in required {
            let data = try Data(contentsOf: payload.appendingPathComponent(name))
            let digest = SHA256.hash(data: data).map { String(format:"%02x", $0) }.joined()
            guard digest == checks[name] else { throw SetupError.invalidPayload(name) }
        }
        let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: payload.appendingPathComponent("extension/manifest.json"))) as? [String:Any]
        guard manifest?["manifest_version"] as? Int == 3 else { throw SetupError.invalidPayload("Manifestet är ogiltigt.") }
    }
    // support is the current user's Application Support directory. Tests pass an isolated fixture root.
    func install(support: URL, simulateFailure: Bool = false) throws -> InstallResult {
        try verify()
        let base = support.appendingPathComponent("Atea Coach Pilot", isDirectory:true)
        let hosts = support.appendingPathComponent("Microsoft Edge/NativeMessagingHosts", isDirectory:true)
        try fm.createDirectory(at: base, withIntermediateDirectories:true)
        try fm.createDirectory(at: hosts, withIntermediateDirectories:true)
        let stage = base.appendingPathComponent(".setup-" + UUID().uuidString, isDirectory:true)
        try fm.createDirectory(at:stage, withIntermediateDirectories:false)
        defer { try? fm.removeItem(at:stage) }
        let extensionTarget = base.appendingPathComponent("extension", isDirectory:true)
        let bridgeTarget = base.appendingPathComponent("CoachBridge")
        let hostTarget = hosts.appendingPathComponent(Self.host + ".json")
        try fm.copyItem(at:payload.appendingPathComponent("extension"), to:stage.appendingPathComponent("extension"))
        try fm.copyItem(at:payload.appendingPathComponent("CoachBridge"), to:stage.appendingPathComponent("CoachBridge"))
        try fm.setAttributes([.posixPermissions:0o755], ofItemAtPath:stage.appendingPathComponent("CoachBridge").path)
        let manifest: [String:Any] = ["name":Self.host,"description":"Coach Pilot – lokal Apple Intelligence-brygga","path":bridgeTarget.path,"type":"stdio","allowed_origins":["chrome-extension://" + Self.extensionID + "/"]]
        try JSONSerialization.data(withJSONObject:manifest, options:[.prettyPrinted,.sortedKeys]).write(to:stage.appendingPathComponent("host.json"))
        let sources = [stage.appendingPathComponent("extension"), stage.appendingPathComponent("CoachBridge"), stage.appendingPathComponent("host.json")]
        let targets = [extensionTarget, bridgeTarget, hostTarget]
        var replaced: [(target: URL, backup: URL?)] = []
        do {
            for index in targets.indices {
                let target = targets[index], backup = stage.appendingPathComponent("previous-\(index)")
                let exists = fm.fileExists(atPath:target.path)
                if exists { try fm.moveItem(at:target, to:backup) }
                replaced.append((target,exists ? backup:nil))
                try fm.moveItem(at:sources[index], to:target)
                if simulateFailure && index == 1 { throw SetupError.installation("Simulerat installationsfel") }
            }
        } catch {
            for item in replaced.reversed() {
                if fm.fileExists(atPath:item.target.path) { try? fm.removeItem(at:item.target) }
                if let backup=item.backup { try? fm.moveItem(at:backup, to:item.target) }
            }
            throw error
        }
        return InstallResult(extensionDirectory:extensionTarget, bridge:bridgeTarget)
    }
    func uninstall(support: URL) throws {
        let base=support.appendingPathComponent("Atea Coach Pilot")
        let host=support.appendingPathComponent("Microsoft Edge/NativeMessagingHosts/" + Self.host + ".json")
        if fm.fileExists(atPath:host.path) {
            let object=try JSONSerialization.jsonObject(with:Data(contentsOf:host)) as? [String:Any]
            guard object?["path"] as? String == base.appendingPathComponent("CoachBridge").path else { throw SetupError.installation("Bryggans sökväg skiljer sig. Ingen fil har tagits bort.") }
            try fm.removeItem(at:host)
        }
        // Remove only files this installer owns, not unrelated files or Chrome's native-host registration.
        for name in ["extension","CoachBridge"] { let item=base.appendingPathComponent(name);if fm.fileExists(atPath:item.path){try fm.removeItem(at:item)} }
    }
}
