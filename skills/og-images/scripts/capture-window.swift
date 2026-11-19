// Captures one window of a running Mac app as a PNG: no shadow, Retina pixels, nothing else on screen.
//
//   swift scripts/capture-window.swift "MyApp" capture.png      (the app's largest on-screen window)
//   swift scripts/capture-window.swift "MyApp"                  (just print the window id)
//
// Bring the app to the front and into the state to show first (osascript -e 'tell app "MyApp" to activate'),
// so the window is the active one: coloured traffic lights, a lit sidebar. Needs Screen Recording permission for
// the terminal. Never captures a different app's window: the owner name must match exactly.
// Only layer 0 windows count. A notch or menu bar app's panel sits on a higher layer and is skipped (it is named on stderr when the app has no layer 0 window):
// for those, use the app's own snapshot flag, or screencapture -l with a window id you looked up yourself.
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: swift capture-window.swift <app name> [out.png]"); exit(2) }
let windows = (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]) ?? []
let mine = windows.filter { ($0[kCGWindowOwnerName as String] as? String) == args[1] && ($0[kCGWindowLayer as String] as? Int) == 0 }
let skipped = windows.filter { ($0[kCGWindowOwnerName as String] as? String) == args[1] && ($0[kCGWindowLayer as String] as? Int) != 0 }.count
func area(_ w: [String: Any]) -> Double {
    guard let b = w[kCGWindowBounds as String] as? [String: Double] else { return 0 }
    return (b["Width"] ?? 0) * (b["Height"] ?? 0)
}
guard let win = mine.max(by: { area($0) < area($1) }), let id = win[kCGWindowNumber as String] as? Int else {
    FileHandle.standardError.write(Data("no on-screen window of \"\(args[1])\" (is it running and not minimised?)\n".utf8))
    if skipped > 0 { FileHandle.standardError.write(Data("skipped \(skipped) window(s) of that app on a higher layer (a notch or menu bar panel): use the app's snapshot flag instead\n".utf8)) }; exit(1)
}
if args.count < 3 { print(id); exit(0) }
let p = Process()
p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
p.arguments = ["-x", "-o", "-l", String(id), args[2]]   // -o: leave out the window's own shadow
try p.run(); p.waitUntilExit()
exit(p.terminationStatus)
