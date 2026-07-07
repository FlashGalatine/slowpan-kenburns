// SlowPan — Streamer.bot "Kenburns Push" action.
//
// This is the Streamer.bot alternative to the bundled Node server: instead of
// running src/server.js, you let Streamer.bot host the overlay + images and this
// C# action supplies the image list. See docs/STREAMERBOT.md for the full setup.
//
//   1. Streamer.bot -> Actions -> new action named EXACTLY "Kenburns Push".
//   2. Sub-action: Core -> C# -> Execute C# Code. Paste EVERYTHING below, click
//      COMPILE (must succeed), then Save.
//   3. Edit ROOT and MEDIA_BASE below for your machine / SB HTTP Server.
//
// It scans <ROOT>/<collection>/*, builds the { config, collections, manifests }
// payload the overlay expects (image URLs served by SB's HTTP Server), wraps it as
// { type:"kenburns:update", kenburns:{...} }, and broadcasts via
// CPH.WebsocketBroadcastJson so every connected overlay updates.
//
// NOTE: uses ONLY types in Streamer.bot's default C# reference set — no Newtonsoft
// (JSON is hand-written) and no System.Uri (its assembly isn't referenced by SB, so
// Uri.EscapeDataString fails to compile; a built-in percent-encoder replaces it).
// Any exception is logged AND broadcast as { type:"kenburns:error", message }.

using System;
using System.IO;
using System.Text;
using System.Globalization;
using System.Collections.Generic;

public class CPHInline
{
    // ── Edit these two for your machine / SB HTTP Server ───────────────────────
    // ROOT = the folder that holds your collection sub-folders (SlowPan/collections).
    const string ROOT       = @"C:\path\to\SlowPan\collections";
    // MEDIA_BASE = the SB HTTP Server URL + the Path you mapped to ROOT.
    const string MEDIA_BASE = "http://127.0.0.1:7474/media";

    static readonly string[] ImageExts = { ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif" };

    public bool Execute()
    {
        try
        {
            string collection   = Str("kenburns.collection", "sample");
            int durationMs   = Clamp(Int("kenburns.durationMs",   8000), 2000, 30000);
            int transitionMs = Clamp(Int("kenburns.transitionMs", 1500),  200,  5000);
            double zoomMin   = ClampD(Dbl("kenburns.zoomMin",  1.0),  1.0, 2.0);
            double zoomMax   = ClampD(Dbl("kenburns.zoomMax",  1.25), zoomMin, 2.5);
            string order     = Order(Str("kenburns.order", "random"));

            var collections = new List<string>();
            var manifests   = new List<KeyValuePair<string, List<string>>>();

            if (Directory.Exists(ROOT))
            {
                var dirs = Directory.GetDirectories(ROOT);
                Array.Sort(dirs, StringComparer.Ordinal);
                foreach (var dir in dirs)
                {
                    string name = Path.GetFileName(dir);
                    var files = new List<string>();
                    foreach (var f in Directory.GetFiles(dir))
                    {
                        string ext = Path.GetExtension(f).ToLowerInvariant();
                        if (Array.IndexOf(ImageExts, ext) >= 0) files.Add(Path.GetFileName(f));
                    }
                    files.Sort(StringComparer.Ordinal);

                    var urls = new List<string>();
                    foreach (var f in files)
                        urls.Add(MEDIA_BASE + "/" + EncodeSegment(name) + "/" + EncodeSegment(f));

                    collections.Add(name);
                    manifests.Add(new KeyValuePair<string, List<string>>(name, urls));
                }
            }
            else
            {
                CPH.LogWarn("[Kenburns Push] ROOT not found: " + ROOT);
            }

            var sb = new StringBuilder();
            sb.Append("{\"type\":\"kenburns:update\",\"kenburns\":{\"config\":{");
            sb.Append("\"collection\":").Append(JsonStr(collection)).Append(',');
            sb.Append("\"durationMs\":").Append(durationMs.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"transitionMs\":").Append(transitionMs.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"zoomMin\":").Append(zoomMin.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"zoomMax\":").Append(zoomMax.ToString(CultureInfo.InvariantCulture)).Append(',');
            sb.Append("\"order\":").Append(JsonStr(order)).Append("},");

            sb.Append("\"collections\":[");
            for (int i = 0; i < collections.Count; i++) { if (i > 0) sb.Append(','); sb.Append(JsonStr(collections[i])); }
            sb.Append("],\"manifests\":{");
            for (int i = 0; i < manifests.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(JsonStr(manifests[i].Key)).Append(":[");
                var urls = manifests[i].Value;
                for (int j = 0; j < urls.Count; j++) { if (j > 0) sb.Append(','); sb.Append(JsonStr(urls[j])); }
                sb.Append(']');
            }
            sb.Append("}}}");

            string json = sb.ToString();
            int imgCount = 0; foreach (var kv in manifests) imgCount += kv.Value.Count;
            CPH.LogInfo("[Kenburns Push] broadcasting " + collections.Count + " collection(s), " + imgCount + " image(s), " + json.Length + " bytes");
            CPH.WebsocketBroadcastJson(json);
            return true;
        }
        catch (Exception ex)
        {
            CPH.LogWarn("[Kenburns Push] ERROR: " + ex);
            CPH.WebsocketBroadcastJson("{\"type\":\"kenburns:error\",\"message\":" + JsonStr(ex.Message) + "}");
            return false;
        }
    }

    // Minimal JSON string encoder.
    static string JsonStr(string s)
    {
        if (s == null) return "\"\"";
        var sb = new StringBuilder(s.Length + 2);
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"':  sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
        return sb.ToString();
    }

    // Percent-encode a path segment (like JS encodeURIComponent), using ONLY
    // char/int math + StringBuilder — NOT System.Uri (unreferenced in SB).
    static string EncodeSegment(string s)
    {
        if (string.IsNullOrEmpty(s)) return s ?? "";
        var sb = new StringBuilder(s.Length * 2);
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                || c == '-' || c == '_' || c == '.' || c == '~') { sb.Append(c); continue; }

            int cp = c;
            if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.Length)
            {
                char lo = s[i + 1];
                if (lo >= 0xDC00 && lo <= 0xDFFF) { cp = 0x10000 + ((c - 0xD800) << 10) + (lo - 0xDC00); i++; }
            }

            if (cp < 0x80) Pct(sb, cp);
            else if (cp < 0x800) { Pct(sb, 0xC0 | (cp >> 6)); Pct(sb, 0x80 | (cp & 0x3F)); }
            else if (cp < 0x10000) { Pct(sb, 0xE0 | (cp >> 12)); Pct(sb, 0x80 | ((cp >> 6) & 0x3F)); Pct(sb, 0x80 | (cp & 0x3F)); }
            else { Pct(sb, 0xF0 | (cp >> 18)); Pct(sb, 0x80 | ((cp >> 12) & 0x3F)); Pct(sb, 0x80 | ((cp >> 6) & 0x3F)); Pct(sb, 0x80 | (cp & 0x3F)); }
        }
        return sb.ToString();
    }
    static void Pct(StringBuilder sb, int b) { sb.Append('%').Append(b.ToString("X2")); }

    // Config helpers: arg override, else global var, else default.
    string Str(string key, string dflt)
    {
        string a;
        if (CPH.TryGetArg(key, out a) && !string.IsNullOrWhiteSpace(a)) return a.Trim();
        var v = CPH.GetGlobalVar<string>(key, true);
        return string.IsNullOrWhiteSpace(v) ? dflt : v.Trim();
    }
    int Int(string key, int dflt)
    { int n; return int.TryParse(Str(key, null), NumberStyles.Integer, CultureInfo.InvariantCulture, out n) ? n : dflt; }
    double Dbl(string key, double dflt)
    { double n; return double.TryParse(Str(key, null), NumberStyles.Float, CultureInfo.InvariantCulture, out n) ? n : dflt; }
    static int Clamp(int v, int lo, int hi) { return Math.Min(hi, Math.Max(lo, v)); }
    static double ClampD(double v, double lo, double hi) { return Math.Min(hi, Math.Max(lo, v)); }
    static string Order(string v) { return string.Equals(v, "sequential", StringComparison.OrdinalIgnoreCase) ? "sequential" : "random"; }
}
