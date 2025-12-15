import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { RemoteVideo } from "./RemoteVideo";
import "./ScreenShare.css";

export function ScreenShare() {
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLDivElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<ReturnType<typeof io>>(null);

  // debug
  const [pcConnectionState, setPcConnectionState] = useState<string>("closed");
  const [iceConnectionState, setIceConnectionState] =
    useState<string>("closed");

  // リモートビデオ管理
  const [remoteVideoTracks, setRemoteVideoTracks] = useState<MediaStreamTrack[]>([]);
  const remoteVideoKeysRef = useRef<string[]>([]);

  // リモートビデオを削除するヘルパー関数
  const removeRemoteVideo = (trackId: string) => {
    console.log(`🗑️ リモートビデオを削除します: ${trackId}`);
    setRemoteVideoTracks(prev => prev.filter(track => track.id !== trackId));
    remoteVideoKeysRef.current = remoteVideoKeysRef.current.filter(key => key !== trackId);
  };

  const stopScreenShare = async () => {
    console.log("🛑 画面共有を停止します");

    // ローカルストリームのトラックを停止
    if (localStreamRef.current) {
      console.log(
        "📍 ローカルストリームのトラック数:",
        localStreamRef.current.getTracks().length
      );
      localStreamRef.current.getTracks().forEach((track) => {
        console.log("🛑 トラックを停止:", track.kind, track.label);
        track.stop();
      });

      localStreamRef.current = null;
    }

    // ローカル映像をクリア
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // 画面共有状態をリセット
    setIsSharing(false);
    console.log("✅ 画面共有を停止しました");
  };

  const startScreenShare = async () => {
    // 接続が確立されるまで待機
    if (!socketRef.current?.connected) {
      console.log("⏳ Socket接続を待機します...");
      let attempts = 0;
      const maxAttempts = 10;

      while (!socketRef.current?.connected && attempts < maxAttempts) {
        if (socketRef.current) {
          socketRef.current.connect();
        }
        console.log(
          `📍 接続待機 ${attempts + 1}/${maxAttempts}: connected=${
            socketRef.current?.connected || false
          }`
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        attempts++;
      }

      if (!socketRef.current?.connected) {
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
      console.log("📍 送信前のSocket接続状態:", socketRef.current);
      if (socketRef.current) {
        socketRef.current.emit("offer", desc);
        console.log("✅ Offer送信完了");
      } else {
        console.error("❌ Socketが初期化されていません");
      }

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

  const onClickButtton = async () => {
    // 画面共有中の場合は停止処理
    if (isSharing) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  // Socket.io接続とイベントの設定
  useEffect(() => {
    console.log("🔌 Socket.io接続とイベントの設定を開始します");

    // Socket.ioの初期化
    const socket = io(import.meta.env.VITE_SIGNALING_ADDRESS, {
      autoConnect: true, // 自動接続を有効化
      transports: ["websocket", "polling"], // トランスポートを明示
    });
    socketRef.current = socket;

    // RTCPeerConnectionの初期化
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    console.log("📍 Socketオブジェクト:", socket);

    // リモートユーザーがPeerConnectionにMediaStreamTrackを追加したら発火
    if (pcRef.current) {
      pcRef.current.addEventListener("track", ({ track }) => {
        console.log("🎬 トラックを受信しました", track);

        if (track.kind === "video") {
          console.log("📹 映像トラックを管理に追加します");
          // 同じtrackIDが既に存在する場合は追加しない
          if (!remoteVideoKeysRef.current.includes(track.id)) {
            setRemoteVideoTracks(prev => [...prev, track]);
            remoteVideoKeysRef.current.push(track.id);
            console.log("✅ リモート映像トラックを追加しました");
          } else {
            console.log("ℹ️ トラックが既に存在するためスキップします");
          }
        }

        if (track.kind === "audio") {
          console.log("🔊 音声トラックの処理を開始します");
          const audio = document.createElement("audio");
          const mediaStream = new MediaStream([track]);
          audio.srcObject = mediaStream;

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

          // 音声トラックの終了イベント
          track.addEventListener("ended", () => {
            console.log("🔊 音声トラックが終了しました", track);
            if (audio) {
              audio.pause();
              audio.srcObject = null;
              audio.remove();
            }
          });
        }
      });

      // RTCPeerConnection.setLocalDescription()の呼び出しに応じて、
      // ICE Candidateが見つかった時や収集が終了した際に発火
      pcRef.current.addEventListener("icecandidate", ({ candidate }) => {
        console.log("🧊 ICE Candidateイベントが発生しました");
        if (candidate) {
          console.log("📍 ICE Candidate:", candidate);

          // ICE Candidateをリモートユーザーへ送信
          console.log("📡 ICE Candidateを送信します");
          console.log("📍 送信前のSocket接続状態:", socket.connected);
          if (socketRef.current) {
            socketRef.current.emit("ice", candidate);
            console.log("✅ ICE Candidate送信完了");
          } else {
            console.error("❌ Socketが初期化されていません");
          }
        } else {
          console.log("🧊 ICE Candidate収集完了");
          console.log("📍 PeerConnection状態:", pcRef.current);
        }
      });

      pcRef.current.addEventListener("connectionstatechange", () => {
        if (!pcRef.current) return;
        setPcConnectionState(pcRef.current.connectionState);
        console.log(
          "🔄 PeerConnectionの接続状態が変化しました:",
          pcRef.current.connectionState
        );
      });

      pcRef.current.addEventListener("iceconnectionstatechange", () => {
        if (!pcRef.current) return;
        setIceConnectionState(pcRef.current.iceConnectionState);
        console.log(
          "🔄 ICE接続状態が変化しました:",
          pcRef.current.iceConnectionState
        );
      });
    }

    // Socket.ioイベントリスナーの設定
    socket.on("connect", () => {
      console.log("✅ Socket.io接続が確立されました", socket);
      setIsWsConnected(true);
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
      setIsWsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket.io接続エラー:", error);
      console.error("📍 エラーメッセージ:", error.message);
      console.error("📍 エラーオブジェクト:", error);
    });

    socket.on("offer", async (desc) => {
      console.log("📥 Offerを受信しました", desc);
      console.log("📍 受信時のPeerConnection状態:", pcRef.current);

      try {
        if (!pcRef.current) {
          console.error("❌ RTCPeerConnectionが初期化されていません");
          return;
        }

        console.log("🤝 RemoteDescriptionを設定します");
        await pcRef.current.setRemoteDescription(desc);
        console.log("✅ RemoteDescription設定完了");
        console.log("📍 PeerConnection状態:", pcRef.current.connectionState);

        console.log("🤝 Answerを生成します");
        const answerDesc = await pcRef.current.createAnswer();
        console.log("✅ Answer生成成功:", answerDesc);

        console.log("🤝 LocalDescriptionを設定します");
        await pcRef.current.setLocalDescription(answerDesc);
        console.log("✅ LocalDescription設定完了");
        console.log("📍 PeerConnection状態:", pcRef.current.connectionState);

        console.log("📡 Answerを送信します");
        console.log("📍 送信前のSocket接続状態:", socket.connected);
        if (socketRef.current) {
          socketRef.current.emit("answer", answerDesc);
          console.log("✅ Answer送信完了");
        } else {
          console.error("❌ Socketが初期化されていません");
        }
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
      console.log(
        "📍 受信時のPeerConnection状態:",
        pcRef.current?.connectionState
      );
      console.log("📍 受信時のICE接続状態:", pcRef.current?.iceConnectionState);

      try {
        if (!pcRef.current) {
          console.error("❌ RTCPeerConnectionが初期化されていません");
          return;
        }

        console.log("🤝 RemoteDescriptionを設定します");
        await pcRef.current.setRemoteDescription(desc);
        console.log("✅ RemoteDescription設定完了");
        console.log("📍 PeerConnection状態:", pcRef.current.connectionState);
        console.log("📍 ICE接続状態:", pcRef.current.iceConnectionState);
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
      console.log(
        "📍 受信時のPeerConnection状態:",
        pcRef.current?.connectionState
      );
      console.log("📍 受信時のICE接続状態:", pcRef.current?.iceConnectionState);

      try {
        if (!pcRef.current) {
          console.error("❌ RTCPeerConnectionが初期化されていません");
          return;
        }

        console.log("🤝 ICE Candidateを追加します");
        await pcRef.current.addIceCandidate(candidate);
        console.log("✅ ICE Candidate追加完了");
        console.log("📍 PeerConnection状態:", pcRef.current.connectionState);
        console.log("📍 ICE接続状態:", pcRef.current.iceConnectionState);
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

      // Socketを切断
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
  }, []);

  return (
    <div className="screen-share-container">
      <div className="connection-status">
        Websocket
        <p>接続状態: {isWsConnected ? "接続中" : "切断中"}</p>
        PeerConnection
        <p>接続状態: {pcConnectionState}</p>
        <p>ice接続状態: {iceConnectionState}</p>
      </div>

      <button
        onClick={onClickButtton}
        className={`start-button ${isSharing ? "stop-button" : ""}`}
      >
        {isSharing ? "画面共有を停止" : "ビデオ通話を開始"}
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
          <div className="remote-videos-container">
            {remoteVideoTracks.map((track) => (
              <RemoteVideo
                key={track.id}
                track={track}
                onTrackEnded={() => removeRemoteVideo(track.id)}
              />
            ))}
          </div>
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
}
