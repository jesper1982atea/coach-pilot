import Foundation
@main struct CoreTests {
 static func main() throws {
  let payload=URL(fileURLWithPath:CommandLine.arguments[1]),root=URL(fileURLWithPath:CommandLine.arguments[2])
  let core=InstallerCore(payload:payload);let fm=FileManager.default
  let first=try core.install(support:root)
  let host=root.appendingPathComponent("Microsoft Edge/NativeMessagingHosts/se.atea.coachpilot.json")
  let manifest=try JSONSerialization.jsonObject(with:Data(contentsOf:host)) as! [String:Any]
  precondition(manifest["path"] as? String == first.bridge.path)
  precondition(manifest["allowed_origins"] as? [String] == ["chrome-extension://lfapachncdlijnjdhjblkgcjloceobmj/"])
  precondition(fm.isExecutableFile(atPath:first.bridge.path))
  print("PASS installation in isolated user root, host path, allowed origin and executable bit")
  try Data("old extension".utf8).write(to:first.extensionDirectory.appendingPathComponent("marker"))
  do { _=try core.install(support:root,simulateFailure:true);fatalError("Expected rollback") } catch {}
  precondition(fm.fileExists(atPath:first.extensionDirectory.appendingPathComponent("marker").path))
  print("PASS rollback restores previous installation")
  _=try core.install(support:root)
  precondition(!fm.fileExists(atPath:first.extensionDirectory.appendingPathComponent("marker").path))
  print("PASS repeat installation replaces extension cleanly")
  let unrelated=root.appendingPathComponent("Atea Coach Pilot/keep-me.txt");try Data("keep".utf8).write(to:unrelated)
  try core.uninstall(support:root)
  precondition(!fm.fileExists(atPath:host.path));precondition(fm.fileExists(atPath:unrelated.path))
  print("PASS uninstall preserves unrelated files")
  let altered=root.appendingPathComponent("altered-payload");try fm.copyItem(at:payload,to:altered)
  try Data("changed".utf8).write(to:altered.appendingPathComponent("extension/panel.js"))
  do { try InstallerCore(payload:altered).verify();fatalError("Expected integrity rejection") } catch {}
  print("PASS modified payload is rejected")
 }
}
