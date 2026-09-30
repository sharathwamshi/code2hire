"""
Minimal signaling relay for Module B's peer-to-peer video call.

This does NOT process or store media itself — it just relays WebRTC
handshake messages (offer/answer/ICE candidates) between the two clients
(candidate + admin/interviewer) who join the same session room. The actual
audio/video stream flows directly between browsers once connected.

For production use behind NAT/firewalls, a TURN server (e.g. coturn) should
be configured on the frontend's RTCPeerConnection ICE servers list — this
signaling relay alone does not include a TURN server.
"""
from flask_socketio import join_room, leave_room, emit

from extensions import socketio


@socketio.on("join_room")
def handle_join_room(data):
    room = data.get("room")
    role = data.get("role", "peer")
    if not room:
        return
    join_room(room)
    emit("peer_joined", {"role": role}, to=room, include_self=False)


@socketio.on("leave_room")
def handle_leave_room(data):
    room = data.get("room")
    if not room:
        return
    leave_room(room)
    emit("peer_left", {}, to=room, include_self=False)


@socketio.on("signal")
def handle_signal(data):
    """Relays an arbitrary WebRTC signaling payload (offer/answer/candidate)
    to the other peer in the room."""
    room = data.get("room")
    if not room:
        return
    emit("signal", data.get("payload"), to=room, include_self=False)


@socketio.on("integrity_ping")
def handle_integrity_ping(data):
    """Optional: lets the candidate's live-call client notify the admin's
    call UI in real time when a violation pauses the session, without
    waiting for the next HTTP poll."""
    room = data.get("room")
    if not room:
        return
    emit("integrity_update", data.get("payload"), to=room, include_self=False)
