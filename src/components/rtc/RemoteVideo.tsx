import { useEffect, useRef, useState } from "react";
import "./RemoteVideo.css";

interface RemoteVideoProps {
  track: MediaStreamTrack;
  onTrackEnded?: () => void;
}

interface TrackDebugInfo {
  id: string;
  kind: string;
  label: string;
  enabled: boolean;
  timestamp: number;
}

export function RemoteVideo({ track, onTrackEnded }: RemoteVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [debugInfo, setDebugInfo] = useState<TrackDebugInfo>(() => ({
    id: track.id,
    kind: track.kind,
    label: track.label,
    enabled: track.enabled,
    timestamp: Date.now()
  }));

  useEffect(() => {
    console.log("🎬 RemoteVideoコンポーネントを初期化します", track);

    const videoElement = videoRef.current;
    if (!videoElement) return;

    // MediaStreamを作成してtrackを追加
    const mediaStream = new MediaStream([track]);
    videoElement.srcObject = mediaStream;

    // trackの状態変化を監視
    const handleTrackEnded = () => {
      console.log("🛑 トラックが終了しました", track);
      onTrackEnded?.();
    };

    const handleMute = () => {
      console.log("🔇 トラックがミュートされました", track);
      setDebugInfo(prev => ({ ...prev, enabled: false, timestamp: Date.now() }));
    };

    const handleUnmute = () => {
      console.log("🔊 トラックがアンミュートされました", track);
      setDebugInfo(prev => ({ ...prev, enabled: true, timestamp: Date.now() }));
    };

    // イベントリスナーを登録
    track.addEventListener("ended", handleTrackEnded);
    track.addEventListener("mute", handleMute);
    track.addEventListener("unmute", handleUnmute);

    // 映像の再生を開始
    videoElement
      .play()
      .then(() => {
        console.log("✅ リモート映像の再生開始");
      })
      .catch((error) => {
        console.error("❌ リモート映像の再生エラー:", error);
      });

    // クリーンアップ処理
    return () => {
      console.log("🧹 RemoteVideoコンポーネントのクリーンアップ");
      track.removeEventListener("ended", handleTrackEnded);
      track.removeEventListener("mute", handleMute);
      track.removeEventListener("unmute", handleUnmute);

      if (videoElement) {
        const stream = videoElement.srcObject as MediaStream;
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
        }
        videoElement.srcObject = null;
      }
    };
  }, [track, onTrackEnded]);

  return (
    <div className="remote-video-item">
      <div className="debug-info">
        <h4>リモート映像情報</h4>
        <div className="debug-details">
          <p><strong>トラックID:</strong> {debugInfo.id}</p>
          <p><strong>種別:</strong> {debugInfo.kind}</p>
          <p><strong>ラベル:</strong> {debugInfo.label || "(なし)"}</p>
          <p><strong>状態:</strong> {debugInfo.enabled ? "有効" : "無効"}</p>
          <p><strong>最終更新:</strong> {new Date(debugInfo.timestamp).toLocaleTimeString()}</p>
        </div>
      </div>
      <video
        ref={videoRef}
        className="remote-video"
        playsInline
        muted
        autoPlay
      />
    </div>
  );
}