// Exports an app's icon as a square PNG (1024 px by default), from whatever the repo or the Mac has:
//   swift scripts/app-icon.swift <source> <out.png> [size] [--ios]
// <source> is one of:
//   AppIcon.icon        an Icon Composer document (Xcode 26): rendered by Xcode's ictool, macOS look (--ios: iOS look)
//   MyApp.app           a built or installed app: the icon macOS itself shows (works for Assets.car-only icons too)
//   AppIcon.appiconset  an asset catalog icon set: its largest PNG
//   AppIcon.icns / .png any image file
// It fails when the result is blank (all transparent or one flat colour): on macOS 26 and later an app's .icns can be an empty
// placeholder while the real icon lives in Assets.car, so never trust an .icns without this check.
import AppKit
import Foundation

let args = CommandLine.arguments.filter { $0 != "--ios" }, ios = CommandLine.arguments.contains("--ios")
guard args.count >= 3 else { fputs("usage: swift app-icon.swift <source .icon|.app|.appiconset|.icns|.png> <out.png> [size] [--ios]\n", stderr); exit(2) }
let src = (args[1] as NSString).expandingTildeInPath, out = (args[2] as NSString).expandingTildeInPath
let size = args.count > 3 ? Int(args[3]) ?? 1024 : 1024
let fm = FileManager.default
guard fm.fileExists(atPath: src) else { fputs("not found: \(src)\n", stderr); exit(1) }
func die(_ m: String) -> Never { fputs(m + "\n", stderr); exit(1) }

var image: NSImage?
let ext = (src as NSString).pathExtension.lowercased()
switch ext {
case "icon":
  // ictool ships inside Icon Composer, inside Xcode
  let pipe = Pipe(), sel = Process()
  sel.executableURL = URL(fileURLWithPath: "/usr/bin/xcode-select"); sel.arguments = ["-p"]; sel.standardOutput = pipe
  try? sel.run(); sel.waitUntilExit()
  let devDir = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "/Applications/Xcode.app/Contents/Developer"
  let ictool = URL(fileURLWithPath: devDir).deletingLastPathComponent().appendingPathComponent("Applications/Icon Composer.app/Contents/Executables/ictool").path
  guard fm.isExecutableFile(atPath: ictool) else { die("an .icon needs Xcode 26 or later (Icon Composer's ictool), not found at \(ictool). Or pass the built .app instead.") }
  let tmp = NSTemporaryDirectory() + "app-icon-\(getpid()).png"
  let p = Process(); p.executableURL = URL(fileURLWithPath: ictool)
  p.arguments = [src, "--export-image", "--output-file", tmp, "--platform", ios ? "iOS" : "macOS", "--rendition", "Default",
                 "--width", "\(size)", "--height", "\(size)", "--scale", "1"]
  p.standardOutput = FileHandle.nullDevice; try? p.run(); p.waitUntilExit()
  image = NSImage(contentsOfFile: tmp); try? fm.removeItem(atPath: tmp)
case "app":
  image = NSWorkspace.shared.icon(forFile: src)
case "appiconset":
  let files = ((try? fm.contentsOfDirectory(atPath: src)) ?? []).filter { $0.lowercased().hasSuffix(".png") }
  let best = files.compactMap { f -> (String, CGFloat)? in
    guard let i = NSImage(contentsOfFile: src + "/" + f), let r = i.representations.first else { return nil }
    return (f, CGFloat(r.pixelsWide)) }.max { $0.1 < $1.1 }
  guard let b = best else { die("no PNG in \(src)") }
  image = NSImage(contentsOfFile: src + "/" + b.0)
default:
  image = NSImage(contentsOfFile: src)
}
guard let img = image else { die("could not read an icon from \(src)") }

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
                           hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current?.imageInterpolation = .high
img.draw(in: NSRect(x: 0, y: 0, width: size, height: size)); NSGraphicsContext.restoreGraphicsState()

// Blank check: count opaque pixels and how much their colour varies.
var opaque = 0, lo = [255, 255, 255], hi = [0, 0, 0]
let step = max(1, size / 64)
for y in stride(from: 0, to: size, by: step) { for x in stride(from: 0, to: size, by: step) {
  guard let c = rep.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB), c.alphaComponent > 0.5 else { continue }
  opaque += 1
  for (i, v) in [c.redComponent, c.greenComponent, c.blueComponent].enumerated() { let n = Int(v * 255); lo[i] = min(lo[i], n); hi[i] = max(hi[i], n) }
} }
let spread = (0..<3).map { hi[$0] - lo[$0] }.max() ?? 0
if opaque < 64 || spread < 24 { die("the icon from \(src) is blank (\(opaque) opaque samples, colour spread \(spread)). On macOS 26 and later an .icns can be an empty placeholder: pass the .app, the .icon or the .appiconset instead.") }

guard let png = rep.representation(using: .png, properties: [:]) else { die("could not encode PNG") }
try? fm.createDirectory(atPath: (out as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
do { try png.write(to: URL(fileURLWithPath: out)) } catch { die("could not write \(out): \(error)") }
print("ok  \(out)  \(size)x\(size)  from \(ext.isEmpty ? "file" : "." + ext)")
