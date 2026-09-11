import AppKit
let root=CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath:root,withIntermediateDirectories:true)
for size in [16,32,128,256,512] { for scale in [1,2] {
 let pixels=size*scale
 let image=NSImage(size:NSSize(width:pixels,height:pixels))
 image.lockFocus()
 let p=CGFloat(pixels)
 NSColor(red:0.12,green:0.25,blue:0.19,alpha:1).setFill()
 NSBezierPath(roundedRect:NSRect(x:p*0.05,y:p*0.05,width:p*0.9,height:p*0.9),xRadius:p*0.2,yRadius:p*0.2).fill()
 let attrs:[NSAttributedString.Key:Any]=[.font:NSFont.systemFont(ofSize:p*0.42,weight:.bold),.foregroundColor:NSColor(red:0.78,green:0.91,blue:0.55,alpha:1)]
 let s="CP" as NSString;let bounds=s.size(withAttributes:attrs)
 s.draw(at:NSPoint(x:(p-bounds.width)/2,y:(p-bounds.height)/2),withAttributes:attrs)
 image.unlockFocus()
 let data=NSBitmapImageRep(data:image.tiffRepresentation!)!.representation(using:.png,properties:[:])!
 try data.write(to:URL(fileURLWithPath:root+"/icon_\(size)x\(size)\(scale == 2 ? "@2x":"").png"))
}}
