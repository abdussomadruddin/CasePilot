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
  const [, , url] = followUpWhatsAppUrls(phone, message);
  window.location.assign(url);
  return Promise.resolve();
}
