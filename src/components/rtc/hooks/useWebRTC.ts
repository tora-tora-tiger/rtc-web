import { useCallback, useEffect, useRef, useState } from "react";

interface UseWebRTCOptions {
  onIceCandidate: (candidate: RTCIceCandidate) => void;
}

interface UseWebRTCReturn {
  remoteTracks: MediaStreamTrack[];
  connectionState: string;
  iceConnectionState: string;
  createOffer: () => Promise<RTCSessionDescriptionInit | null>;
  createAnswer: (
    remoteDesc: RTCSessionDescriptionInit,
  ) => Promise<RTCSessionDescriptionInit | null>;
  setRemoteDescription: (desc: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
}

// onIceCandidate は useCallback を使う必要がある
export const useWebRTC = ({
  onIceCandidate,
}: UseWebRTCOptions): UseWebRTCReturn => {
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const [connectionState, setConnectionState] = useState<string>("new");
  const [iceConnectionState, setIceConnectionState] = useState<string>("new");
  const [remoteTracks, setRemoteTracks] = useState<MediaStreamTrack[]>([]);

  useEffect(() => {
    pcRef.current = new RTCPeerConnection({
      iceServers: [
        {
          urls: import.meta.env.VITE_STUN_ADDRESS,
        },
      ],
    });
    const pc = pcRef.current;

    pc.onicecandidate = event => {
      if (event.candidate) {
        console.log("New ICE candidate: ", event.candidate);
        onIceCandidate(event.candidate);
      }
    };

    pc.ontrack = event => {
      console.log("New track received: ", event.track);
      setRemoteTracks(prev => {
        if (prev.find(t => t.id === event.track.id)) {
          return prev;
        }
        return [...prev, event.track];
      });
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      setIceConnectionState(pc.iceConnectionState);
    };

    return () => {
      pc.close();
    };
  }, [onIceCandidate]);

  const createOffer = useCallback(async () => {
    if (!pcRef.current) {
      console.error(
        "Cannot create offer because PeerConnection is not initialized",
      );
      return null;
    }
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    return offer;
  }, []);

  // Answerを作成して返す
  const createAnswer = useCallback(
    async (remoteDesc: RTCSessionDescriptionInit) => {
      if (!pcRef.current) {
        console.error(
          "Cannot create answer because PeerConnection not initialized",
        );
        return null;
      }
      await pcRef.current.setRemoteDescription(remoteDesc);
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      return answer;
    },
    [],
  );

  // リモートからのAnswerを設定する
  const setRemoteDescription = useCallback(
    async (desc: RTCSessionDescriptionInit) => {
      if (!pcRef.current) {
        console.error(
          "Cannot set remote description because PeerConnection not initialized",
        );
        return;
      }
      await pcRef.current.setRemoteDescription(desc);
    },
    [],
  );

  // リモートからのICE Candidateを追加する
  const addIceCandidate = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      if (!pcRef.current) {
        console.error(
          "Cannot add ICE candidate because PeerConnection not initialized",
        );
        return;
      }
      await pcRef.current.addIceCandidate(candidate);
    },
    [],
  );

  return {
    remoteTracks,
    connectionState,
    iceConnectionState,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
  };
};
