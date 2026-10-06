import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import {
  Send, Paperclip, FileText, Download,
  Users, MessageSquare, StickyNote, Search, Reply, Trash2, X,
  UserPlus, UsersRound, Plus, LogOut, Crown, MessageCircle, ChevronLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { chatApi, usersApi } from '../api/client';
import { ChatNotesPopup } from '../components/ChatNotesPopup';

const lastSeenKey = (slug) => `chat_last_seen_${slug}`;
const getLastSeen = (slug) => Number(localStorage.getItem(lastSeenKey(slug)) || 0);

export const CollaborationHub = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeSlug, setActiveSlug] = useState('general-qa');
  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [unread, setUnread] = useState({});
  const [inputMessage, setInputMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [groupModal, setGroupModal] = useState(false);
  const [dmModal, setDmModal] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [createType, setCreateType] = useState('GROUP');
  const [pickedMembers, setPickedMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const stompClientRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeSlugRef = useRef(activeSlug);
  activeSlugRef.current = activeSlug;

  const activeRoom = rooms.find((r) => r.slug === activeSlug);
  const messages = messagesByRoom[activeSlug] || [];
  const visibleMessages = search.trim()
    ? messages.filter((m) =>
        (m.messageText || '').toLowerCase().includes(search.trim().toLowerCase()) ||
        (m.senderUsername || '').toLowerCase().includes(search.trim().toLowerCase()))
    : messages;

  const dmName = useCallback((room) => {
    if (!room || room.type !== 'DM') return room?.name;
    const other = (room.members || []).find((m) => String(m.id) !== String(user?.id));
    return other ? other.username : 'Direct message';
  }, [user?.id]);

  const roomLabel = useCallback((room) => {
    if (!room) return activeSlug;
    return room.type === 'DM' ? dmName(room) : `# ${room.name}`;
  }, [activeSlug, dmName]);

  const loadRooms = useCallback(async (keepActive = true) => {
    try {
      const res = await chatApi.getRooms();
      const list = res.data || [];
      setRooms(list);
      if (!keepActive) return list;
      if (!list.some((r) => r.slug === activeSlugRef.current) && list.length > 0) {
        openRoom(list[0].slug, list);
      }
      return list;
    } catch (err) {
      console.warn('Could not load chat rooms');
      return [];
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await usersApi.getAll();
      setUsers((res.data || []).filter((u) => String(u.id) !== String(user?.id)));
    } catch {
      // user list is best-effort (non-admins may be forbidden)
    }
  }, [user?.id]);

  const loadHistory = useCallback(async (slug) => {
    try {
      const res = await chatApi.getHistory(slug);
      setMessagesByRoom((prev) => ({ ...prev, [slug]: res.data || [] }));
    } catch {
      setMessagesByRoom((prev) => ({ ...prev, [slug]: prev[slug] || [] }));
    }
  }, []);

  const openRoom = (slug, roomList) => {
    setActiveSlug(slug);
    setReplyTo(null);
    setSearch('');
    setInfoOpen(false);
    setUnread((prev) => ({ ...prev, [slug]: 0 }));
    localStorage.setItem(lastSeenKey(slug), String(Date.now()));
    setMessagesByRoom((prev) => {
      if (prev[slug]) return prev;
      loadHistory(slug);
      return prev;
    });
  };

  useEffect(() => {
    loadRooms(false).then((list) => {
      if (list.length > 0) {
        const first = list.some((r) => r.slug === 'general-qa') ? 'general-qa' : list[0].slug;
        setActiveSlug(first);
        loadHistory(first);
        localStorage.setItem(lastSeenKey(first), String(Date.now()));
      }
    });
    loadUsers();
  }, [loadRooms, loadUsers, loadHistory]);

  // Single global subscription: backend broadcasts everything to /topic/chat.
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:8080/ws';
    const socket = new SockJS(wsUrl);
    const client = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 5000,
    });
    client.onConnect = () => {
      setConnected(true);
      client.subscribe('/topic/chat', (message) => {
        let received;
        try {
          received = JSON.parse(message.body);
        } catch {
          return;
        }
        if (received.type === 'DELETE' && received.id) {
          setMessagesByRoom((prev) => {
            const next = { ...prev };
            for (const slug of Object.keys(next)) {
              next[slug] = next[slug].filter((m) => String(m.id) !== String(received.id));
            }
            return next;
          });
          return;
        }
        if (!received.roomId) return;
        const slug = received.roomId;
        setMessagesByRoom((prev) => {
          const list = prev[slug] || [];
          if (received.id != null && list.some((m) => String(m.id) === String(received.id))) return prev;
          return { ...prev, [slug]: [...list, received] };
        });
        if (slug !== activeSlugRef.current) {
          setUnread((prev) => ({ ...prev, [slug]: (prev[slug] || 0) + 1 }));
        } else {
          localStorage.setItem(lastSeenKey(slug), String(Date.now()));
        }
      });
    };
    client.onDisconnect = () => setConnected(false);
    client.activate();
    stompClientRef.current = client;
    return () => client.deactivate();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeSlug]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const chatPayload = {
      senderId: user?.id || '00000000-0000-0000-0000-000000000000',
      senderUsername: user?.username || 'QA Engineer',
      roomId: activeSlug,
      messageText: inputMessage.trim(),
      replyToSender: replyTo?.senderUsername || null,
      replyToText: replyTo ? (replyTo.messageText || (replyTo.fileUrl ? 'Attachment' : '')) : null,
      type: 'CHAT',
      timestamp: new Date().toISOString(),
    };
    if (stompClientRef.current && stompClientRef.current.connected) {
      stompClientRef.current.publish({
        destination: '/app/chat.sendMessage',
        body: JSON.stringify(chatPayload),
      });
    } else {
      setMessagesByRoom((prev) => ({ ...prev, [activeSlug]: [...(prev[activeSlug] || []), chatPayload] }));
    }
    setInputMessage('');
    setReplyTo(null);
  };

  const handleDeleteMessage = async (id) => {
    try {
      await chatApi.deleteMessage(id);
      setMessagesByRoom((prev) => ({
        ...prev,
        [activeSlug]: (prev[activeSlug] || []).filter((m) => String(m.id) !== String(id)),
      }));
    } catch {
      // tombstone broadcast will handle live removal for others
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', activeSlug);
    formData.append('senderId', user?.id || '00000000-0000-0000-0000-000000000000');
    formData.append('senderUsername', user?.username || 'QA Engineer');
    formData.append('caption', file.name);
    try {
      await chatApi.uploadMedia(formData);
    } catch (err) {
      console.error('File upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setBusy(true);
    try {
      const res = await chatApi.createGroup({
        name: newGroupName.trim(),
        description: newGroupDesc.trim(),
        memberIds: createType === 'GROUP' ? pickedMembers : [],
        type: createType,
      });
      await loadRooms(false);
      setGroupModal(false);
      setNewGroupName('');
      setNewGroupDesc('');
      setPickedMembers([]);
      if (res.data?.slug) openRoom(res.data.slug);
    } finally {
      setBusy(false);
    }
  };

  const handleStartDm = async (otherId) => {
    setBusy(true);
    try {
      const res = await chatApi.getOrCreateDm(otherId);
      await loadRooms(false);
      setDmModal(false);
      if (res.data?.slug) openRoom(res.data.slug);
    } finally {
      setBusy(false);
    }
  };

  const handleAddMembers = async (ids) => {
    if (!ids.length) return;
    await chatApi.addMembers(activeSlug, ids);
    await loadRooms();
  };

  const handleRemoveMember = async (id) => {
    await chatApi.removeMember(activeSlug, id);
    if (String(id) === String(user?.id)) {
      await loadRooms(false);
      setActiveSlug('general-qa');
      loadHistory('general-qa');
    } else {
      await loadRooms();
    }
  };

  const handleDeleteRoom = async () => {
    await chatApi.deleteRoom(activeSlug);
    await loadRooms(false);
    setInfoOpen(false);
    setActiveSlug('general-qa');
    loadHistory('general-qa');
  };

  const togglePick = (id) => {
    setPickedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
  };

  const renderMedia = (fileUrl, fileType) => {
    if (!fileUrl) return null;
    const isImage = fileType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(fileUrl);
    const isVideo = fileType?.startsWith('video/') || /\.(mp4|webm)$/i.test(fileUrl);
    if (isImage) {
      return (
        <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 max-w-sm">
          <img src={fileUrl} alt="Attachment" className="w-full h-auto object-cover max-h-64" />
        </div>
      );
    }
    if (isVideo) {
      return (
        <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 max-w-md">
          <video controls className="w-full max-h-64">
            <source src={fileUrl} type={fileType || 'video/mp4'} />
            Your browser does not support HTML5 video.
          </video>
        </div>
      );
    }
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-600 hover:text-sky-500 font-mono transition-colors"
      >
        <FileText className="w-4 h-4 text-slate-400" />
        <span>View Attachment</span>
        <Download className="w-3.5 h-3.5 ml-1" />
      </a>
    );
  };

  const channels = rooms.filter((r) => r.type === 'CHANNEL');
  const groups = rooms.filter((r) => r.type === 'GROUP');
  const dms = rooms.filter((r) => r.type === 'DM');
  const isAdmin = user?.role === 'ROLE_ADMIN';
  const canDeleteMsg = (msg) => String(msg.senderId) === String(user?.id) || isAdmin;

  const RoomButton = ({ room }) => {
    const label = room.type === 'DM' ? dmName(room) : `# ${room.name}`;
    const sub = room.type === 'DM'
      ? 'Direct message'
      : room.type === 'GROUP'
        ? `${(room.members || []).length} members`
        : room.description;
    const count = unread[room.slug] || 0;
    return (
      <button
        key={room.slug}
        onClick={() => openRoom(room.slug)}
        className={`w-full text-left p-3 rounded-xl transition-all ${
          activeSlug === room.slug
            ? 'bg-gradient-to-r from-sky-500 to-violet-600 text-white shadow-glow'
            : 'hover:bg-sky-50 text-slate-500 hover:text-slate-800'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm truncate flex items-center gap-1.5">
            {room.type === 'DM' ? <MessageCircle className="w-3.5 h-3.5 shrink-0" /> : null}
            <span className="truncate">{label}</span>
          </span>
          {count > 0 && (
            <span className="shrink-0 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </div>
        <p className={`text-xs mt-1 truncate ${activeSlug === room.slug ? 'text-sky-50' : 'text-slate-400'}`}>
          {sub}
        </p>
      </button>
    );
  };

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Channels Sidebar */}
      <div className="w-80 bg-white/80 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-500" />
            <h2 className="font-bold text-slate-900 text-base">Team Channels</h2>
          </div>
          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-bold border ${
            connected ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {connected ? 'STOMP Live' : 'Offline'}
          </span>
        </div>

        <div className="p-3 space-y-1 overflow-y-auto flex-1">
          {channels.length > 0 && (
            <div className="flex items-center justify-between px-3 pt-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Channels</p>
              <button
                onClick={() => { setCreateType('CHANNEL'); setGroupModal(true); }}
                title="New channel"
                className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
          {channels.length === 0 && (
            <div className="mx-3 mt-1 p-3 rounded-xl border border-dashed border-slate-300 text-center">
              <p className="text-xs text-slate-400">No channels yet.</p>
              <button
                onClick={() => { setCreateType('CHANNEL'); setGroupModal(true); }}
                className="mt-1.5 text-xs font-semibold text-sky-600 hover:text-sky-500"
              >
                + New channel
              </button>
            </div>
          )}
          {channels.map((room) => <RoomButton key={room.slug} room={room} />)}

          <div className="flex items-center justify-between px-3 pt-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Groups</p>
            <button
              onClick={() => { setCreateType('GROUP'); setGroupModal(true); }}
              title="Create group"
              className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {groups.length === 0 && <p className="text-xs text-slate-400 px-3">No groups yet — create one.</p>}
          {groups.map((room) => <RoomButton key={room.slug} room={room} />)}

          <div className="flex items-center justify-between px-3 pt-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Direct messages</p>
            <button
              onClick={() => setDmModal(true)}
              title="New chat"
              className="p-1 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {dms.length === 0 && <p className="text-xs text-slate-400 px-3">No chats yet — start one.</p>}
          {dms.map((room) => <RoomButton key={room.slug} room={room} />)}
        </div>
      </div>

      {/* Main Chat Feed */}
      <div className="flex-1 flex flex-col bg-white/60 min-w-0">
        {/* Room Header */}
        <div className="p-4 border-b border-slate-200 bg-white/80 flex items-center justify-between gap-3">
          <button onClick={() => activeRoom && setInfoOpen(true)} className="text-left min-w-0" title="Chat info">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 truncate">
              <MessageSquare className="w-4 h-4 text-violet-500 shrink-0" />
              <span className="truncate">{activeRoom ? roomLabel(activeRoom) : activeSlug}</span>
            </h2>
            <p className="text-xs text-slate-500 truncate">
              {activeRoom?.type === 'GROUP' ? `${(activeRoom.members || []).length} members — click for info` : activeRoom?.type === 'CHANNEL' ? 'Open channel — click for info' : activeRoom?.description}
            </p>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl w-40 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>
            <button
              onClick={() => setNotesOpen(true)}
              title="Write a quick note"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all"
            >
              <StickyNote className="w-4 h-4" />
              Notes
            </button>
          </div>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {visibleMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
              <MessageSquare className="w-10 h-10 opacity-30" />
              <p className="text-sm">{search ? 'No messages match your search.' : 'No messages yet. Say hello!'}</p>
            </div>
          ) : (
            visibleMessages.map((msg, index) => {
              const isMe = String(msg.senderId) === String(user?.id) || msg.senderUsername === user?.username;
              return (
                <div key={msg.id || index} className={`flex flex-col group ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-baseline gap-2 mb-1 px-1">
                    <span className="text-xs font-bold text-slate-600">{msg.senderUsername || 'QA Engineer'}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : 'Now'}
                    </span>
                    <span className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={() => setReplyTo(msg)}
                        title="Reply"
                        className="p-0.5 text-slate-400 hover:text-sky-600 transition-colors"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                      {msg.id && canDeleteMsg(msg) && (
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          title="Delete"
                          className="p-0.5 text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                  <div className={`max-w-lg rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    isMe
                      ? 'bg-gradient-to-r from-sky-500 to-violet-600 text-white rounded-tr-none shadow-glow'
                      : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'
                  }`}>
                    {(msg.replyToText || msg.replyToSender) && (
                      <div className={`mb-1.5 pl-2.5 py-1 rounded-r-lg border-l-[3px] text-xs ${isMe ? 'border-white/60 bg-white/10' : 'border-sky-400 bg-sky-50'}`}>
                        <p className={`font-bold ${isMe ? 'text-sky-100' : 'text-sky-600'}`}>{msg.replyToSender || 'Reply'}</p>
                        <p className={`truncate ${isMe ? 'text-white/90' : 'text-slate-500'}`}>{msg.replyToText}</p>
                      </div>
                    )}
                    {msg.messageText && <p className="leading-relaxed">{msg.messageText}</p>}
                    {renderMedia(msg.fileUrl, msg.fileType)}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-200 bg-white/80">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-xs">
              <Reply className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sky-600">{replyTo.senderUsername}</p>
                <p className="truncate text-slate-500">{replyTo.messageText || 'Attachment'}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <form onSubmit={handleSendMessage} className="flex items-center gap-3">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach screenshot, video recording, or logs"
              className="p-2.5 text-slate-400 hover:text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-100 rounded-xl transition-all disabled:opacity-50"
            >
              {uploading ? (
                <div className="w-5 h-5 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </button>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Message ${activeRoom ? roomLabel(activeRoom) : ''}...`}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 transition-all"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="p-2.5 bg-gradient-to-r from-sky-500 to-violet-600 hover:from-sky-400 hover:to-violet-500 text-white rounded-xl shadow-glow disabled:opacity-50 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      {/* Group/DM info drawer */}
      {infoOpen && activeRoom && (
        <ChatInfoDrawer
          room={activeRoom}
          users={users}
          isAdmin={isAdmin}
          currentUserId={user?.id}
          onClose={() => setInfoOpen(false)}
          onAdd={handleAddMembers}
          onRemove={handleRemoveMember}
          onDelete={handleDeleteRoom}
        />
      )}

      {/* Create group modal */}
      {groupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setGroupModal(false)}>
          <form
            onSubmit={handleCreateGroup}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <UsersRound className="w-4 h-4 text-sky-500" />
              <h3 className="font-bold text-slate-900 text-sm">{createType === 'CHANNEL' ? 'New channel' : 'New group'}</h3>
              <button type="button" onClick={() => setGroupModal(false)} className="ml-auto p-1.5 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={createType === 'CHANNEL' ? 'Channel name... (e.g. backend-alerts)' : 'Group name...'}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              <input
                value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                placeholder="Description (optional)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
              {createType === 'CHANNEL' && (
                <p className="text-xs text-slate-500 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
                  Channels are open to everyone in the workspace — no need to add members.
                </p>
              )}
              {createType === 'GROUP' && (
              <>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Add members</p>
              <div className="max-h-44 overflow-y-auto space-y-1">
                {users.map((u) => (
                  <label key={u.id} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-sky-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={pickedMembers.includes(u.id)}
                      onChange={() => togglePick(u.id)}
                      className="accent-sky-500"
                    />
                    <span className="font-semibold text-slate-700">{u.username}</span>
                    <span className="text-[10px] text-slate-400">{(u.role || '').replace('ROLE_', '')}</span>
                  </label>
                ))}
                {users.length === 0 && <p className="text-xs text-slate-400">No other users found.</p>}
              </div>
              </>
              )}
              <button
                type="submit"
                disabled={busy || !newGroupName.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-violet-600 disabled:opacity-50"
              >
                {busy ? 'Creating...' : createType === 'CHANNEL' ? 'Create channel' : 'Create group'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New DM modal */}
      {dmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setDmModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-card overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-sky-500" />
              <h3 className="font-bold text-slate-900 text-sm">New chat</h3>
              <button onClick={() => setDmModal(false)} className="ml-auto p-1.5 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 max-h-80 overflow-y-auto">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleStartDm(u.id)}
                  disabled={busy}
                  className="w-full text-left p-3 rounded-xl hover:bg-sky-50 transition-colors"
                >
                  <p className="text-sm font-semibold text-slate-800">{u.username}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </button>
              ))}
              {users.length === 0 && <p className="text-xs text-slate-400 p-3">No other users found.</p>}
            </div>
          </div>
        </div>
      )}

      {notesOpen && <ChatNotesPopup onClose={() => setNotesOpen(false)} />}
    </div>
  );
};

function ChatInfoDrawer({ room, users, isAdmin, currentUserId, onClose, onAdd, onRemove, onDelete }) {
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const memberIds = new Set((room.members || []).map((m) => String(m.id)));
  const outsiders = users.filter((u) => !memberIds.has(String(u.id)));
  const isCreator = String(room.createdBy) === String(currentUserId);
  const canDelete = isCreator || isAdmin;

  return (
    <div className="w-80 shrink-0 bg-white border-l border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-200 flex items-center gap-2">
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="font-bold text-slate-900 text-sm">Chat info</h3>
      </div>
      <div className="p-4 overflow-y-auto flex-1 space-y-4">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-sky-500 to-violet-600 flex items-center justify-center text-white">
            {room.type === 'DM' ? <MessageCircle className="w-6 h-6" /> : <UsersRound className="w-6 h-6" />}
          </div>
          <p className="mt-2 font-bold text-slate-900">{room.name}</p>
          {room.description && <p className="text-xs text-slate-500">{room.description}</p>}
        </div>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Members ({(room.members || []).length})
          </p>
          <div className="space-y-1">
            {(room.members || []).map((m) => (
              <div key={m.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-50">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">
                  {m.username?.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-slate-700 truncate flex-1">
                  {m.username}
                  {String(m.id) === String(currentUserId) && <span className="text-slate-400 font-normal"> (you)</span>}
                </span>
                {String(room.createdBy) === String(m.id) && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                {String(m.id) !== String(currentUserId) && (
                  <button
                    onClick={() => onRemove(m.id)}
                    title="Remove"
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {room.type === 'CHANNEL' && (
          <p className="text-xs text-slate-500 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
            Open channel — visible to everyone in the workspace.
          </p>
        )}

        {room.type !== 'CHANNEL' && outsiders.length === 0 && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            No one else to add — everyone in the workspace is already here. Create users in User Management to invite more people.
          </p>
        )}
        {room.type === 'CHANNEL' && outsiders.length === 0 && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            Everyone in the workspace can already see this channel.
          </p>
        )}
        {outsiders.length > 0 && (
          <button
            onClick={() => setAddOpen(true)}
            className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-500 to-violet-600 hover:from-sky-400 hover:to-violet-500 shadow-glow flex items-center justify-center gap-1.5 transition-all"
          >
            <UserPlus className="w-4 h-4" /> Add members
          </button>
        )}

        <div className="pt-2 border-t border-slate-100 space-y-2">
          {room.type !== 'CHANNEL' && (
            <button
              onClick={() => onRemove(currentUserId)}
              className="w-full py-2 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> {room.type === 'DM' ? 'Delete conversation' : 'Leave group'}
            </button>
          )}
          {canDelete && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-slate-50"
            >
              Delete this chat for everyone
            </button>
          )}
          {canDelete && confirmDelete && (
            <button
              onClick={onDelete}
              className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-rose-500 hover:bg-rose-600"
            >
              Confirm delete
            </button>
          )}
        </div>
      </div>

      {addOpen && (
        <AddMembersModal
          outsiders={outsiders}
          onClose={() => setAddOpen(false)}
          onAdd={(ids) => {
            onAdd(ids);
            setAddOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AddMembersModal({ outsiders, onClose, onAdd }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const filtered = query.trim()
    ? outsiders.filter(
        (u) =>
          (u.username || '').toLowerCase().includes(query.trim().toLowerCase()) ||
          (u.email || '').toLowerCase().includes(query.trim().toLowerCase())
      )
    : outsiders;

  const toggle = (id) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-card border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-sky-500" />
          <h3 className="font-bold text-slate-900 text-sm">Add members</h3>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <div className="relative mb-3">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filtered.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-sky-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(u.id)}
                  onChange={() => toggle(u.id)}
                  className="accent-sky-500"
                />
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {u.username?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{u.username}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
              </label>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">
                {query ? 'No users match your search.' : 'No one left to add.'}
              </p>
            )}
          </div>
          <button
            onClick={() => picked.length > 0 && onAdd(picked)}
            disabled={picked.length === 0}
            className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-violet-600 hover:from-sky-400 hover:to-violet-500 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Add{picked.length > 0 ? ` ${picked.length} member${picked.length > 1 ? 's' : ''}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
