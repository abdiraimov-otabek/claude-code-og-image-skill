// Captures one window of a running Mac app as a PNG: no shadow, Retina pixels, nothing else on screen.
//
//   swift scripts/capture-window.swift "MyApp" capture.png      (the app's largest on-screen window)
//   swift scripts/capture-window.swift "MyApp"                  (just print the window id)
//   swift scripts/capture-window.swift --popup "MyApp" pop.png  (a menu bar app's open popup or panel: open it first)
//
// Bring the app to the front and into the state to show first (osascript -e 'tell app "MyApp" to activate'),
// so the window is the active one: coloured traffic lights, a lit sidebar. Needs Screen Recording permission for
// the terminal. Never captures a different app's window: the owner name must match exactly.
// Only layer 0 windows count, unless --popup: then only windows above layer 0 (a menu bar popup, a panel) count, and the
// status item itself (a sliver under 40 points tall) is skipped. Open the popup first, e.g. with a click or the app's shortcut.
import CoreGraphics
import Foundation

var args = CommandLine.arguments
let popup = args.contains("--popup"); args.removeAll { $0 == "--popup" }
guard args.count >= 2 else { print("usage: swift capture-window.swift <app name> [out.png]"); exit(2) }
let windows = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
let owned = windows.filter { ($0[kCGWindowOwnerName as String] as? String) == args[1] }
func height(_ w: [String: Any]) -> Double { (w[kCGWindowBounds as String] as? [String: Double])?["Height"] ?? 0 }
let mine = owned.filter { popup ? ($0[kCGWindowLayer as String] as? Int ?? 0) > 0 && height($0) >= 40 : ($0[kCGWindowLayer as String] as? Int) == 0 }
let skipped = popup ? 0 : owned.count - mine.count
func area(_ w: [String: Any]) -> Double {
    guard let b = w[kCGWindowBounds as String] as? [String: Double] else { return 0 }
    return (b["Width"] ?? 0) * (b["Height"] ?? 0)
}
guard let win = mine.max(by: { area($0) < area($1) }), let id = win[kCGWindowNumber as String] as? Int else {
    FileHandle.standardError.write(Data("no on-screen window of \"\(args[1])\" (is it running and not minimised?)\n".utf8))
    if skipped > 0 { FileHandle.standardError.write(Data("skipped \(skipped) window(s) of that app on a higher layer (a notch or menu bar panel): open the popup and run again with --popup\n".utf8)) }; exit(1)
}
if args.count < 3 { print(id); exit(0) }
let p = Process()
p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
// A popup is see-through: captured alone (-l) it is composited over nothing and turns mid-grey. Capture its rectangle
// of the screen instead (-R), with a plain light window behind it, so it looks the way the user sees it.
let b = win[kCGWindowBounds as String] as? [String: Double] ?? [:]
let rect = [b["X"] ?? 0, b["Y"] ?? 0, b["Width"] ?? 0, b["Height"] ?? 0].map { String(Int($0)) }.joined(separator: ",")
p.arguments = popup ? ["-x", "-R", rect, args[2]] : ["-x", "-o", "-l", String(id), args[2]]   // -o: leave out the window's own shadow
try p.run(); p.waitUntilExit()
exit(p.terminationStatus)
