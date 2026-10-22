import path from "node:path";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Seconds as a frame-exact rational, the way FCPXML wants time.
export function rational(seconds, fps) {
  const frames = Math.round(seconds * fps);
  return frames === 0 ? "0s" : `${frames}/${fps}s`;
}

// EXP-2: the A-cut as an FCPXML timeline that points at the original camera files.
export function fcpxml({ name, segments, clips, sourceDir }) {
  const byId = Object.fromEntries(clips.map((c, i) => [c.id, { ...c, ref: `r${i + 2}` }]));
  const main = clips[0], fps = main.source_fps || 30;
  const assets = Object.values(byId).map((c) => {
    const url = "file://" + encodeURI(path.join(sourceDir, c.file));
    return `    <asset id="${c.ref}" name="${esc(path.parse(c.file).name)}" start="0s" duration="${rational(c.duration, c.source_fps || fps)}" hasVideo="1" hasAudio="1" format="r1" audioSources="1" audioChannels="1" audioRate="48000">\n      <media-rep kind="original-media" src="${esc(url)}"/>\n    </asset>`;
  });
  let offset = 0;
  const spine = segments.map((s) => {
    const c = byId[s.source], cfps = c.source_fps || fps, d = s.out - s.in;
    const xml = `          <asset-clip ref="${c.ref}" name="${esc(s.lineId)}" offset="${rational(offset, fps)}" start="${rational(s.in, cfps)}" duration="${rational(d, cfps)}" tcFormat="NDF"/>`;
    offset += d;
    return xml;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormatReel" frameDuration="1/${fps}s" width="${main.source_width || 1080}" height="${main.source_height || 1920}"/>
${assets.join("\n")}
  </resources>
  <library>
    <event name="${esc(name)}">
      <project name="${esc(name)} A-cut">
        <sequence format="r1" duration="${rational(offset, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="mono" audioRate="48k">
          <spine>
${spine.join("\n")}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
