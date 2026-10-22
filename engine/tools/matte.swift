// Person mask for every PNG in a folder, using the Mac's own Vision model. White = person. Nothing leaves the Mac.
// The engine builds this once (swiftc -O) and runs it as: matte <frames folder> <output folder>
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let inDir = URL(fileURLWithPath: args[1]), outDir = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let ctx = CIContext()
let files = try FileManager.default.contentsOfDirectory(at: inDir, includingPropertiesForKeys: nil)
  .filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }

for f in files {
  guard let src = CGImageSourceCreateWithURL(f as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
  let req = VNGeneratePersonSegmentationRequest()
  req.qualityLevel = .accurate
  req.outputPixelFormat = kCVPixelFormatType_OneComponent8
  try VNImageRequestHandler(cgImage: img, options: [:]).perform([req])
  guard let buf = req.results?.first?.pixelBuffer else { continue }
  var mask = CIImage(cvPixelBuffer: buf)
  let sx = CGFloat(img.width) / mask.extent.width, sy = CGFloat(img.height) / mask.extent.height
  mask = mask.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
  guard let out = ctx.createCGImage(mask, from: CGRect(x: 0, y: 0, width: img.width, height: img.height), format: .L8, colorSpace: CGColorSpaceCreateDeviceGray()) else { continue }
  let dest = CGImageDestinationCreateWithURL(outDir.appendingPathComponent(f.lastPathComponent) as CFURL, UTType.png.identifier as CFString, 1, nil)!
  CGImageDestinationAddImage(dest, out, nil)
  CGImageDestinationFinalize(dest)
}
print("mattes: \(files.count)")
