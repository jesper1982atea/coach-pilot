import SwiftUI
import AppKit
import FoundationModels

@main struct CoachPilotSetup: App {
 var body: some Scene { WindowGroup("Coach Pilot · Kom igång") { SetupView().preferredColorScheme(.light) }.windowStyle(.hiddenTitleBar).windowResizability(.contentSize) }
}
struct SetupView: View {
 private let forest=Color(red:0.12,green:0.25,blue:0.19)
 private let lime=Color(red:0.78,green:0.91,blue:0.55)
 @State private var installed: URL?
 @State private var message="Allt du behöver finns i paketet."
 @State private var error=false
 @State private var working=false
 @State private var showRemoval=false
 @State private var aiStatus="Kontrolleras i Edge efter installation."
 private let preview=CommandLine.arguments.contains("--preview")
 private var support: URL { FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0] }
 private var core: InstallerCore { InstallerCore(payload:Bundle.main.resourceURL!.appendingPathComponent("Payload")) }
 private var edgeURL: URL? { NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.microsoft.edgemac") }
 var body: some View {
  HStack(spacing:0) {
   VStack(alignment:.leading,spacing:24) {
    Image(systemName:"sparkles.rectangle.stack.fill").font(.system(size:37)).foregroundStyle(lime)
    Text("COACH\nPILOT").font(.system(size:30,weight:.bold,design:.rounded)).tracking(1).foregroundStyle(.white)
    Text("En enklare start.\nEn sak i taget.").font(.system(size:16)).lineSpacing(5).foregroundStyle(.white.opacity(0.8))
    Spacer()
    step("1","Installera på din Mac",done:installed != nil)
    step("2","Lägg till i Edge",done:false)
    step("3","Logga in och testa",done:false)
    Spacer()
    Text("KOLLEGAPILOT · 0.5.0\nApple Silicon · macOS 26+").font(.system(size:10,weight:.medium)).lineSpacing(5).foregroundStyle(.white.opacity(0.65))
   }.padding(28).frame(width:235).frame(maxHeight:.infinity).background(forest)
   VStack(alignment:.leading,spacing:17) {
    HStack { Text("VÄLKOMMEN").font(.system(size:10,weight:.bold)).tracking(2).foregroundStyle(.secondary);Spacer();Text("LOKAL AI").font(.system(size:10,weight:.semibold)).padding(.horizontal,9).padding(.vertical,5).background(lime.opacity(0.45),in:Capsule()) }
    Text(installed == nil ? "Redo för Sales Coach?" : "Nu är det Edges tur.").font(.system(size:27,weight:.bold)).foregroundStyle(forest)
    Text(installed == nil ? "Installera piloten och AI-bryggan på ditt eget konto. Ingen Terminal, kod eller API-nyckel behövs." : "Filerna är installerade. Gör de tre stegen nedan för att lägga till tillägget i Edge.").font(.system(size:13)).foregroundStyle(.secondary).lineSpacing(3)
    HStack(spacing:10) {
     Image(systemName:edgeURL == nil ? "exclamationmark.circle":"checkmark.circle.fill").foregroundStyle(edgeURL == nil ? .orange:.green)
     VStack(alignment:.leading,spacing:3){Text(edgeURL == nil ? "Microsoft Edge saknas":"Microsoft Edge finns på din Mac").font(.system(size:12,weight:.semibold));Text(aiStatus).font(.system(size:11)).foregroundStyle(.secondary)}
    }.padding(13).frame(maxWidth:.infinity,alignment:.leading).background(Color.white,in:RoundedRectangle(cornerRadius:12))
    if installed == nil {
     Button(action:install) { HStack{if working{ProgressView().controlSize(.small)}else{Image(systemName:"arrow.down.circle.fill")};Text(working ? "Installerar…":"Installera på min Mac").fontWeight(.semibold)}.frame(maxWidth:.infinity).padding(.vertical,9) }.buttonStyle(.borderedProminent).tint(forest).disabled(working || edgeURL == nil || preview)
     Text("Installationen använder bara ditt användarkonto. Dina Sales Coach-uppgifter och provsvar följer inte med i paketet.").font(.system(size:11)).foregroundStyle(.secondary).lineSpacing(3)
    } else {
     VStack(alignment:.leading,spacing:12) {
      instruction("1","Öppna tilläggssidan", "Slå på Utvecklarläge i Edge.")
      instruction("2","Välj Läs in okomprimerat", "Tryck ⌘⇧G i filväljaren, klistra in sökvägen och välj mappen.")
      instruction("3","Öppna Coach Pilot i Edge", "Logga in i Sales Coach och välj Kontrollera AI-anslutning.")
     }
     HStack{Button("Öppna Edge-tillägg"){openEdge("edge://extensions/")};Button("Kopiera sökväg"){NSPasteboard.general.clearContents();NSPasteboard.general.setString(installed!.path,forType:.string);message="Sökvägen kopierad. Klistra in den i Edges filväljare.";error=false}}
     HStack{Button("Visa mappen"){NSWorkspace.shared.open(installed!)};Button("Öppna Sales Coach"){openEdge("https://salescoach.apple.com/home/for-you")}}
    }
    Text(message).font(.system(size:12)).lineSpacing(3).foregroundStyle(error ? Color.red:forest).padding(12).frame(maxWidth:.infinity,alignment:.leading).background(error ? Color.red.opacity(0.06):lime.opacity(0.2),in:RoundedRectangle(cornerRadius:10)).textSelection(.enabled)
    Spacer(minLength:0)
    HStack { Button("Startguide"){openGuide()};Spacer();Button("Ta bort lokala filer…"){showRemoval=true}.disabled(working||preview).font(.system(size:10)) }.buttonStyle(.link)
    Text("Oberoende testversion. Inte en officiell Apple- eller Atea-produkt. Autopiloten skickar svar först när du själv startar den.").font(.system(size:10)).foregroundStyle(.secondary).lineSpacing(2)
   }.padding(28).frame(width:505).background(Color(red:0.96,green:0.97,blue:0.94))
  }.frame(width:740,height:650)
  .task { if preview{message="Förhandsvisning – inga filer installeras."};switch SystemLanguageModel.default.availability {case .available: aiStatus="Apple Intelligence tillgängligt. Testa svar i Edge.";case .unavailable: aiStatus="Aktivera Apple Intelligence i Systeminställningar."} }
  .alert("Ta bort pilotens lokala filer?",isPresented:$showRemoval){Button("Avbryt",role:.cancel){};Button("Ta bort",role:.destructive){remove()}}message:{Text("Tilläggets filer och Edge-bryggan tas bort från ditt konto. Ta sedan bort Coach Pilot på edge://extensions. Dina resultat i Sales Coach påverkas inte.")}
 }
 private func step(_ n:String,_ title:String,done:Bool)->some View { HStack(spacing:10){Text(done ? "✓":n).font(.system(size:11,weight:.bold)).frame(width:24,height:24).background(lime.opacity(done ? 1:0.2),in:Circle()).foregroundStyle(done ? forest:lime);Text(title).font(.system(size:12)).foregroundStyle(.white)} }
 private func instruction(_ n:String,_ title:String,_ detail:String)->some View {HStack(alignment:.top,spacing:10){Text(n).font(.system(size:11,weight:.bold)).frame(width:22,height:22).background(lime.opacity(0.6),in:Circle());VStack(alignment:.leading,spacing:3){Text(title).font(.system(size:12,weight:.semibold));Text(detail).font(.system(size:11)).foregroundStyle(.secondary).fixedSize(horizontal:false,vertical:true)}}}
 private func install(){working=true;error=false;message="Kontrollerar paketet och installerar filer…";let installer=core,base=support
  Task {do{let result=try await Task.detached {try installer.install(support:base)}.value;installed=result.extensionDirectory;message="Installerat. Öppna Edge-tillägg och kopiera sökvägen nedan. Om piloten redan finns i Edge: välj Läs in igen."}catch{self.error=true;message=error.localizedDescription};working=false}
 }
 private func remove(){do{try core.uninstall(support:support);installed=nil;message="Lokala filer borttagna. Ta också bort tillägget i Edge.";error=false}catch{self.error=true;message=error.localizedDescription}}
 private func openEdge(_ value:String){guard let app=edgeURL,let url=URL(string:value) else{return};NSWorkspace.shared.open([url],withApplicationAt:app,configuration:NSWorkspace.OpenConfiguration()){_,problem in if let problem {Task{@MainActor in self.error=true;message=problem.localizedDescription}}}}
 private func openGuide(){if let guide=Bundle.main.url(forResource:"Startguide",withExtension:"html"){NSWorkspace.shared.open(guide)}}
}
