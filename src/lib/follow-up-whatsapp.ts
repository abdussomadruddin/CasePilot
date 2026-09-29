export function followUpWhatsAppUrls(phone: string, message = ""): [string, string, string] {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0060")
    ? digits.slice(2)
    : digits.startsWith("60")
      ? digits
      : digits.startsWith("0")
        ? `60${digits.slice(1)}`
        : `60${digits}`;

  if (!/^601\d{8,9}$/.test(normalized)) {
    throw new Error("Invalid Malaysian mobile number for WhatsApp.");
  }

  const text = message ? `text=${encodeURIComponent(message)}` : "";
  const appQuery = `phone=${normalized}${text ? `&${text}` : ""}`;
  return [
    `whatsapp-business://send?${appQuery}`,
    `whatsapp://send?${appQuery}`,
    `https://wa.me/${normalized}${text ? `?${text}` : ""}`,
  ];
}

export function openFollowUpWhatsApp(phone: string, message = ""): Promise<void> {
  const urls = followUpWhatsAppUrls(phone, message);

  return new Promise((resolve) => {
    let index = 0;
    let timer: number | undefined;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", finish);
      resolve();
    };
    const onVisibilityChange = () => {
      if (document.hidden) finish();
    };
    const attempt = () => {
      if (finished) return;
      const url = urls[index++];
      try {
        window.location.assign(url);
      } catch {
        if (index < urls.length) attempt();
        else finish();
        return;
      }
      if (index < urls.length) timer = window.setTimeout(attempt, 1500);
      else finish();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", finish);
    attempt();
  });
}
