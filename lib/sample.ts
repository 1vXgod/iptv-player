/** Built-in demo playlist using public HLS test streams. */
export const SAMPLE_PLAYLIST = `#EXTM3U
#EXTINF:-1 tvg-name="Mux Test" group-title="Demo",Mux Test Stream
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-name="Tears of Steel" group-title="Movies",Tears of Steel
https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8
#EXTINF:-1 tvg-name="Apple BipBop" group-title="Demo",Apple BipBop 16x9
https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8
#EXTINF:-1 tvg-name="Apple Advanced" group-title="Demo",Apple Advanced fMP4
https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8
#EXTINF:-1 tvg-name="Sintel" group-title="Movies",Sintel
https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8
#EXTINF:-1 tvg-name="Akamai Live" group-title="Live",Akamai Live Test
https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8
#EXTINF:-1 tvg-name="Offline" group-title="Live",Offline Channel (demo)
https://example.invalid/offline/stream.m3u8
`;
