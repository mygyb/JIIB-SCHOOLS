// Same counting rules as the server (artifacts/api-server/src/routes/sms.ts), so the screen shows the real number of SMS before sending.
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

/** Swaps fancy characters (dashes, curly quotes) for plain ones, which is what is actually sent. */
export function plainSms(text: string): string {
  return text.replace(/[–—−]/g, "-").replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/ /g, " ");
}

export function smsSegments(input: string): number {
  const text = plainSms(input);
  let units = 0;
  let unicode = false;
  for (const char of text) {
    if (GSM_BASIC.includes(char)) units += 1;
    else if (GSM_EXTENDED.includes(char)) units += 2;
    else { unicode = true; units += char.length; }
  }
  if (!units) return 0;
  if (unicode) return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
  return units <= 160 ? 1 : Math.ceil(units / 153);
}
