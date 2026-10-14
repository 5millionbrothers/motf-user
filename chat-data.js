(function connectCustomerChat() {
  const client = window.motfSupabase;
  if (!client) return;

  const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
  let activeConversationId = "";
  let reloadTimer = 0;
  let presenceTimer = 0;
  let presenceConversationId = "";
  let loadVersion = 0;
  let authVersion = 0;
  let chatContext = "";
  let linkHandled = false;

  function messageBody(text, attachments) {
    const fileText = attachments.length ? `\n${attachments.map((name) => `[첨부: ${name}]`).join("\n")}` : "";
    return `${text}${fileText}`.trim();
  }

  function isChatVisible() {
    return document.body.dataset.currentRoute === "chat"
      && document.visibilityState === "visible"
      && isUuid(activeConversationId);
  }

  async function setPresence(conversationId, isActive) {
    if (!isUuid(conversationId)) return;
    const { error } = await client.rpc("set_chat_presence", {
      target_conversation_id: conversationId,
      is_active: isActive,
    });
    if (error) console.error(error);
    return !error;
  }

  function stopPresence() {
    window.clearInterval(presenceTimer);
    presenceTimer = 0;
    const previousId = presenceConversationId;
    presenceConversationId = "";
    if (previousId) void setPresence(previousId, false);
  }

  async function syncActiveConversation({ markRead = true } = {}) {
    if (!isChatVisible()) {
      stopPresence();
      return;
    }

    if (presenceConversationId && presenceConversationId !== activeConversationId) {
      void setPresence(presenceConversationId, false);
    }
    presenceConversationId = activeConversationId;

    if (markRead) {
      const { error } = await client.rpc("mark_conversation_read", {
        target_conversation_id: activeConversationId,
      });
      if (error) console.error(error);
    } else {
      await setPresence(activeConversationId, true);
    }

    window.clearInterval(presenceTimer);
    presenceTimer = window.setInterval(() => {
      if (!isChatVisible() || presenceConversationId !== activeConversationId) {
        stopPresence();
        return;
      }
      void setPresence(activeConversationId, true).then((ok) => {
        if (!ok) { stopPresence(); void loadChats(); }
      });
    }, 45_000);
  }

  async function resolveLinkedChat(userId) {
    if (linkHandled) return "";
    const id = new URLSearchParams(location.search).get("conversationId");
    if (!isUuid(id)) return "";
    linkHandled = true;
    const { data, error } = await client.from("conversations")
      .select("id, organization_id, customer_id").eq("id", id).maybeSingle();
    const permitted = data?.organization_id
      ? window.motfCanEditOrganization?.(data.organization_id)
      : data?.customer_id === userId;
    if (error || !data || !permitted) {
      window.toast?.("이 채팅을 확인할 권한이 없습니다.");
      return "";
    }
    if ((window.motfGetOrganizationId?.() || null) !== (data.organization_id || null)) {
      await window.motfSetOrganizationScope?.(data.organization_id || null);
    }
    return data.id;
  }

  async function loadChats(preferredId = activeConversationId) {
    const authStamp = authVersion;
    await window.motfOrganizationReady;
    await window.motfReloadOrganization?.();
    const { data: authData } = await client.auth.getSession();
    if (!authData.session?.user) {
      window.motfApplyChats?.([], "");
      return;
    }
    preferredId = await resolveLinkedChat(authData.session.user.id) || preferredId;
    const scope = window.motfGetOrganizationId?.() || null;
    const version = ++loadVersion;
    const context = authData.session.user.id + ":" + (scope || "");
    if (chatContext !== context) {
      stopPresence();
      activeConversationId = "";
      chatContext = context;
      const input = document.querySelector("#chatText");
      const attachment = document.querySelector("#chatAttachment");
      if (input) input.value = "";
      if (attachment) attachment.value = "";
      window.motfApplyChats?.([], "");
    }
    const { data: supportConversationId, error: supportError } = await client.rpc(
      scope ? "start_organization_support_conversation" : "start_support_conversation",
      scope ? { target_organization_id: scope } : undefined);
    if (supportError) console.error(supportError);
    let query = client.from("conversations")
      .select("id, business_id, organization_id, customer_name, group_name, last_message_at, businesses(business_name, business_type, address, cover_image_url), messages(id, sender_id, sender_name, sender_role, body, read_at, created_at)");
    query = scope ? query.eq("organization_id", scope) : query.eq("customer_id", authData.session.user.id).is("organization_id", null);
    const { data, error } = await query.order("last_message_at", { ascending: false });
    if (authStamp !== authVersion || version !== loadVersion || scope !== (window.motfGetOrganizationId?.() || null)) return;
    if (error) return console.error(error);
    const chats = (data || []).map((conversation) => {
      const messages = [...(conversation.messages || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const isSupport = conversation.businesses?.business_type === "support" || conversation.id === supportConversationId;
      return {
        id: conversation.id,
        organizationId: conversation.organization_id || null,
        title: conversation.businesses?.business_name || "업장 채팅",
        subtitle: messages.at(-1)?.body || "대화를 시작해보세요.",
        isSupport,
        address: conversation.businesses?.address || "",
        image: conversation.businesses?.cover_image_url || "",
        messages: messages.map((message) => ({
          from: message.sender_role === "user" ? "user" : message.sender_role === "partner" ? "owner" : "admin",
          senderName: conversation.organization_id ? message.sender_name || "" : "",
          createdAt: message.created_at,
          text: message.body,
          read: Boolean(message.read_at) || message.sender_role !== "user",
        })),
      };
    }).sort((a, b) => Number(b.isSupport) - Number(a.isSupport));
    activeConversationId = chats.some((item) => item.id === preferredId) ? preferredId : chats[0]?.id || "";
    window.motfApplyChats?.(chats, activeConversationId);
    await syncActiveConversation({ markRead: true });
  }

  window.motfOpenDatabaseChat = function openDatabaseChat(businessName) {
    const business = window.motfFindBusinessByName?.(businessName);
    if (!business || !isUuid(business.id)) return false;
    void (async () => {
      const { data: authData } = await client.auth.getSession();
      if (!authData.session?.user) {
        alert("채팅을 시작하려면 먼저 로그인해주세요.");
        window.motfNavigate?.("chat");
        return;
      }
      await window.motfOrganizationReady;
      await window.motfReloadOrganization?.();
      const scope = window.motfGetOrganizationId?.();
      const { data, error } = await client.rpc(scope ? "start_organization_business_conversation" : "start_business_conversation", {
        ...(scope ? { target_organization_id: scope } : {}),
        target_business_id: business.id,
        target_reservation_id: null,
      });
      if (error) {
        console.error(error);
        alert(`채팅을 시작하지 못했습니다.\n${error.message}`);
        return;
      }
      activeConversationId = data;
      await loadChats(data);
      window.motfNavigate?.("chat");
    })();
    return true;
  };

  document.addEventListener("click", (event) => {
    const thread = event.target.closest("[data-chat-id]");
    if (thread && isUuid(thread.dataset.chatId)) {
      activeConversationId = thread.dataset.chatId;
      window.setTimeout(() => void loadChats(activeConversationId), 0);
    }
  }, true);

  document.addEventListener("submit", async (event) => {
    if (event.target.id !== "chatForm") return;
    const conversationId = window.motfGetActiveChatId?.();
    if (!isUuid(conversationId)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = document.querySelector("#chatText");
    const attachmentInput = document.querySelector("#chatAttachment");
    const attachments = attachmentInput?.files ? [...attachmentInput.files].map((file) => file.name) : [];
    const body = messageBody(input?.value.trim() || "", attachments);
    if (!body) return;
    const button = event.target.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    window.motfChatPending = true;
    let error;
    try {
      ({ error } = await client.rpc("send_chat_message", {
        target_conversation_id: conversationId,
        message_body: body,
      }));
    } catch (failure) { error = failure; }
    finally { window.motfChatPending = false; if (button) button.disabled = false; }
    if (error) {
      console.error(error);
      alert(`메시지를 보내지 못했습니다.\n${error.message}`);
      return;
    }
    if (input) input.value = "";
    if (attachmentInput) attachmentInput.value = "";
    activeConversationId = conversationId;
    await loadChats(conversationId);
    const messageArea = document.querySelector("#chatMessages");
    if (messageArea) messageArea.scrollTop = messageArea.scrollHeight;
  }, true);

  function scheduleReload() {
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => loadChats(activeConversationId), 250);
  }

  client.channel("customer-chat-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, scheduleReload)
    .subscribe();

  window.motfReloadChats = loadChats;
  window.addEventListener("motf:organization-changed", () => {
    loadVersion += 1;
    stopPresence();
    activeConversationId = "";
    window.motfApplyChats?.([], "");
    scheduleReload();
  });

  client.auth.onAuthStateChange((event) => {
    authVersion += 1;
    loadVersion += 1;
    linkHandled = false;
    if (event === "SIGNED_IN") window.setTimeout(() => loadChats(), 0);
    if (event === "SIGNED_OUT") {
      stopPresence();
      window.motfApplyChats?.([], "");
    }
  });

  window.addEventListener("motf:routechange", () => {
    if (isChatVisible()) void loadChats(activeConversationId);
    else stopPresence();
  });
  document.addEventListener("visibilitychange", () => {
    if (isChatVisible()) void syncActiveConversation({ markRead: true });
    else stopPresence();
  });
  window.addEventListener("pagehide", stopPresence);
  window.setTimeout(() => loadChats(), 0);
})();
