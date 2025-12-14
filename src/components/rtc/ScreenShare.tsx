import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./ScreenShare.css";


export function ScreenShare() {
  const [isConnected, setIsConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideosRef = useRef<HTMLDivElement>(null);
  const remoteAudioRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const socket = io("http://localhost:3001", {
    autoConnect: true, // 自動接続を有効化
    transports: ["websocket", "polling"], // トランスポートを明示
  });

  const onClickButtton = async () => {
    // 画面共有中は何もしない
    if (isSharing) {
      console.log("📹 画面共有中のため処理をスキップします");
      return;
    }

    // 接続が確立されるまで待機
    if (!socket.connected) {
      console.log("⏳ Socket接続を待機します...");
      let attempts = 0;
      const maxAttempts = 10;

      while (!socket.connected && attempts < maxAttempts) {
        socket.connect();
        console.log(
          `📍 接続待機 ${attempts + 1}/${maxAttempts}: connected=${
            socket.connected
          }`
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }

      if (!socket.connected) {
        alert("サーバーに接続できません。しばらくしてから再度お試しください。");
        return;
      }
    }

    if (!pcRef.current) {
      console.error("❌ RTCPeerConnectionが初期化されていません");
      return;
    }

    try {
      console.log("📹 メディアデバイスへのアクセスを開始します");
      // 端末のカメラとマイクのアクセスをリクエスト
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      console.log("✅ メディアデバイスの取得成功");
      console.log("📹 トラック:", stream.getTracks());

      localStreamRef.current = stream;
      console.log("📍 localStreamRefにストリームを設定しました");

      console.log("🔗 WebRTC PeerConnectionにトラックを追加します");
      for (const track of stream.getTracks()) {
        pcRef.current.addTrack(track, stream);
        console.log(`🔗 トラック追加: ${track.kind} ${track.label}`);
        // ボタンを連打したときに重複して追加されているので直す
      }

      if (localVideoRef.current) {
        console.log("🎬 ローカル映像の設定を開始します");
        // ブラウザのポリシーによる映像再生エラーの回避
        localVideoRef.current.playsInline = true;
        localVideoRef.current.muted = true;

        // MediaStreamをvideoタグにアタッチ
        localVideoRef.current.srcObject = stream;
        console.log("📍 srcObjectにストリームを設定しました");

        try {
          await localVideoRef.current.play();
          console.log("✅ ローカル映像の再生開始");
        } catch (playError) {
          console.error("❌ ローカル映像の再生エラー:", playError);
        }
      } else {
        console.error("❌ localVideoRef.currentがnullです");
      }

      console.log("🤝 WebRTC Offerの生成を開始します");
      console.log("📍 PeerConnection状態:", pcRef.current.connectionState);
      console.log("📍 ICE接続状態:", pcRef.current.iceConnectionState);

      // LocalDescriptionを生成
      const desc = await pcRef.current.createOffer();
      console.log("✅ Offer生成成功:", desc);

      // LocalDescriptionをPeerConnectionにセット
      await pcRef.current.setLocalDescription(desc);
      console.log("✅ LocalDescription設定完了", pcRef);

      // LocalDescriptionをリモートユーザーへ送信
      console.log("📡 Offerを送信します");
      console.log("📍 送信前のSocket接続状態:", socket);
      socket.emit("offer", desc);
      console.log("✅ Offer送信完了");

      // 画面共有状態を設定
      setIsSharing(true);
      console.log("✅ 画面共有を開始しました");
    } catch (error) {
      console.error("❌ メディアデバイスへのアクセスエラー:", error);
      if (error instanceof Error) {
        console.error("📍 エラー詳細:", error);
      }
    }
  };

  // Socket.io接続とイベントの設定
  useEffect(() => {
    console.log("🔌 Socket.io接続とイベントの設定を開始します");
    // RTCPeerConnectionの初期化
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    console.log("📍 Socketオブジェクト:", socket);

    // 接続状態の継続的監視
    const connectionMonitor = setInterval(() => {
      console.log(
        `📍[${new Date().toISOString()}] 接続状態監視: connected=${
          socket.connected
        }, id=${socket.id}`
      );
    }, 2000);
    // リモートユーザーがPeerConnectionにMediaStreamTrackを追加したら発火
    pc.addEventListener("track", ({ track }) => {
      console.log("🎬 トラックを受信しました", track);

      if (track.kind === "video") {
        console.log("📹 映像トラックの処理を開始します");
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        video.style.width = "100%";
        video.srcObject = new MediaStream([track]);

        video
          .play()
          .then(() => {
            console.log("✅ リモート映像の再生開始");
            if (remoteVideosRef.current) {
              remoteVideosRef.current.appendChild(video);
              console.log("✅ 映像要素をDOMに追加しました");
              console.log(
                "📍 リモート映像要素数:",
                remoteVideosRef.current.children.length
              );
            } else {
              console.error("❌ remoteVideosRef.currentがnullです");
            }
          })
          .catch((playError) => {
            console.error("❌ リモート映像の再生エラー:", playError);
          });
      }

      if (track.kind === "audio") {
        console.log("🔊 音声トラックの処理を開始します");
        const audio = document.createElement("audio");
        audio.srcObject = new MediaStream([track]);

        audio
          .play()
          .then(() => {
            console.log("✅ リモート音声の再生開始");
            if (remoteAudioRef.current) {
              remoteAudioRef.current.appendChild(audio);
              console.log("✅ 音声要素をremoteAudioRefに追加しました");
              console.log(
                "📍 リモート音声要素数:",
                remoteAudioRef.current.children.length
              );
            } else {
              console.error("❌ remoteAudioRef.currentがnullです");
            }
          })
          .catch((playError) => {
            console.error("❌ リモート音声の再生エラー:", playError);
          });
      }
    });

    // RTCPeerConnection.setLocalDescription()の呼び出しに応じて、
    // ICE Candidateが見つかった時や収集が終了した際に発火
    pc.addEventListener("icecandidate", ({ candidate }) => {
      console.log("🧊 ICE Candidateイベントが発生しました");
      if (candidate) {
        console.log("📍 ICE Candidate:", candidate);
        console.log("📍 Candidate Foundation:", candidate.foundation);
        console.log("📍 Candidate Priority:", candidate.priority);
        console.log("📍 Candidate IP:", candidate.address);
        console.log("📍 Candidate Port:", candidate.port);
        console.log("📍 Candidate Protocol:", candidate.protocol);
        console.log("📍 Candidate Type:", candidate.type);

        // ICE Candidateをリモートユーザーへ送信
        console.log("📡 ICE Candidateを送信します");
        console.log("📍 送信前のSocket接続状態:", socket.connected);
        socket.emit("ice", candidate);
        console.log("✅ ICE Candidate送信完了");
      } else {
        console.log("🧊 ICE Candidate収集完了");
        console.log("📍 PeerConnection状態:", pcRef.current?.connectionState);
        console.log("📍 ICE接続状態:", pcRef.current?.iceConnectionState);
        console.log("📍 ICE収集状態:", pcRef.current?.iceGatheringState);
      }
    });

    // Socket.ioイベントリスナーの設定
    socket.on("connect", () => {
      console.log("✅ Socket.io接続が確立されました", socket);
      setIsConnected(true);
    });

    socket.io.on("open", () => {
      console.log("🔓 Socket.io Engineが開かれました", socket);
    });

    socket.io.on("close", (reason) => {
      console.log("🔒 Socket.io Engineが閉じられました", reason, socket);
    });

    socket.io.on("error", (error) => {
      console.error("❌ Socket.io Engineエラー:", error);
    });

    socket.io.on("reconnect", (attemptNumber) => {
      console.log("🔄 Socket.io再接続成功");
      console.log("📍 試行回数:", attemptNumber);
    });

    socket.io.on("reconnect_attempt", (attemptNumber) => {
      console.log(`🔄 Socket.io再接続試行 ${attemptNumber}`);
    });

    socket.io.on("reconnect_failed", () => {
      console.error("❌ Socket.io再接続失敗");
    });

    socket.on("disconnect", (reason) => {
      console.log("❌ Socket.io接続が切断されました");
      console.log("📍 切断理由:", reason);
      console.log("📍 Socket ID:", socket.id);
      console.log("📍 接続状態:", socket.connected);
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket.io接続エラー:", error);
      console.error("📍 エラーメッセージ:", error.message);
      console.error("📍 エラーオブジェクト:", error);
    });

    socket.on("offer", async (desc) => {
      console.log("📥 Offerを受信しました", desc);
      console.log("📍 受信時のPeerConnection状態:", pc);

      try {
        console.log("🤝 RemoteDescriptionを設定します");
        await pc.setRemoteDescription(desc);
        console.log("✅ RemoteDescription設定完了");
        console.log("📍 PeerConnection状態:", pc.connectionState);

        console.log("🤝 Answerを生成します");
        const answerDesc = await pc.createAnswer();
        console.log("✅ Answer生成成功:", answerDesc);

        console.log("🤝 LocalDescriptionを設定します");
        await pc.setLocalDescription(answerDesc);
        console.log("✅ LocalDescription設定完了");
        console.log("📍 PeerConnection状態:", pc.connectionState);

        console.log("📡 Answerを送信します");
        console.log("📍 送信前のSocket接続状態:", socket.connected);
        socket.emit("answer", answerDesc);
        console.log("✅ Answer送信完了");
      } catch (error) {
        console.error("❌ Offer処理エラー:", error);
        if (error instanceof Error) {
          console.error("📍 エラー詳細:", error.message);
          console.error("📍 エラー名:", error.name);
        }
      }
    });

    // リモートユーザーのanswerイベントを受信し、RemoteDescriptionをPeerConnectionにセット
    socket.on("answer", async (desc) => {
      console.log("📥 Answerを受信しました");
      console.log("📍 Answerタイプ:", desc.type);
      console.log(
        "📍 Answer SDP（先頭50文字）:",
        desc.sdp?.substring(0, 50) + "..."
      );
      console.log("📍 受信時のPeerConnection状態:", pc.connectionState);
      console.log("📍 受信時のICE接続状態:", pc.iceConnectionState);

      try {
        console.log("🤝 RemoteDescriptionを設定します");
        await pc.setRemoteDescription(desc);
        console.log("✅ RemoteDescription設定完了");
        console.log("📍 PeerConnection状態:", pc.connectionState);
        console.log("📍 ICE接続状態:", pc.iceConnectionState);
      } catch (error) {
        console.error("❌ Answer処理エラー:", error);
        if (error instanceof Error) {
          console.error("📍 エラー詳細:", error.message);
          console.error("📍 エラー名:", error.name);
        }
      }
    });

    // リモートユーザーのiceイベントを受信し、ICE Candidateを追加
    socket.on("ice", async (candidate) => {
      console.log("📥 ICE Candidateを受信しました");
      console.log("📍 Candidate:", candidate);
      console.log("📍 受信時のPeerConnection状態:", pc.connectionState);
      console.log("📍 受信時のICE接続状態:", pc.iceConnectionState);

      try {
        console.log("🤝 ICE Candidateを追加します");
        await pc.addIceCandidate(candidate);
        console.log("✅ ICE Candidate追加完了");
        console.log("📍 PeerConnection状態:", pc.connectionState);
        console.log("📍 ICE接続状態:", pc.iceConnectionState);
      } catch (error) {
        console.error("❌ ICE Candidate追加エラー:", error);
        if (error instanceof Error) {
          console.error("📍 エラー詳細:", error.message);
          console.error("📍 エラー名:", error.name);
        }
      }
    });

    return () => {
      console.log("🧹 コンポーネントのクリーンアップを開始します");
      console.log("📍 クリーンアップ前のSocket接続状態:", socket.connected);

      pcRef.current?.close();
      console.log("✅ RTCPeerConnectionを閉じました");

      // 接続状態監視を停止
      clearInterval(connectionMonitor);
      console.log("✅ 接続状態監視を停止しました");

      socket.disconnect();
      console.log("✅ Socketを切断しました");

      if (localStreamRef.current) {
        console.log(
          "📍 ローカルストリームのトラック数:",
          localStreamRef.current.getTracks().length
        );
        localStreamRef.current.getTracks().forEach((track) => {
          console.log("🛑 トラックを停止:", track.kind, track.label);
          track.stop();
        });
        console.log("✅ すべてのメディアトラックを停止しました");
      }

      // 画面共有状態をリセット
      setIsSharing(false);
      console.log("🧹 クリーンアップ完了");
    };
  });

  return (
    <div className="screen-share-container">
      <div className="connection-status">
        接続状態: {isConnected ? "接続中" : "切断中"}
      </div>

      <button
        onClick={onClickButtton}
        className="start-button"
        disabled={isSharing}
      >
        {isSharing ? "画面共有中..." : "ビデオ通話を開始"}
      </button>

      <div className="video-container">
        <div className="local-video">
          <h3>ローカル映像</h3>
          <video
            ref={localVideoRef}
            style={{ width: "100%", maxWidth: "400px" }}
          />
        </div>

        <div className="remote-videos">
          <h3>リモート映像</h3>
          <div ref={remoteVideosRef} className="remote-videos-container" />
        </div>

        <div className="remote-audios">
          <div
            ref={remoteAudioRef}
            className="remote-audios-container"
            style={{ display: "none" }}
          />
        </div>
      </div>
    </div>
  );
};
