import sharp from "sharp";

export type TankImageInput = {
  seed: string;
  sizeMm: number;
  ageDays: number;
  dead?: boolean;
};

export function marimoRadiusForSize(sizeMm: number): number {
  // 初代まりもちゃんと同様に、実サイズがそのまま画面上の大きさになる。
  // 上限を設けず、長く育てると画面からはみ出すことも成長の記録とする。
  return Math.max(7, sizeMm);
}

export async function renderTankImage(input: TankImageInput): Promise<Buffer> {
  const centerX = 600;
  const centerY = 390;
  const radius = marimoRadiusForSize(input.sizeMm);
  const water = input.dead ? "#87977a" : "#7fc9e6";
  const mossLight = input.dead ? "#53604b" : "#20a51f";
  const mossMiddle = input.dead ? "#414c3c" : "#078522";
  const mossDark = input.dead ? "#303a2d" : "#006d19";
  const blur = Math.max(1.5, Math.min(8, radius * 0.025));
  const svg = `
    <svg width="1200" height="675" viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="moss" cx="42%" cy="36%" r="68%">
          <stop offset="0" stop-color="${mossLight}"/>
          <stop offset="0.72" stop-color="${mossMiddle}"/>
          <stop offset="1" stop-color="${mossDark}"/>
        </radialGradient>
        <filter id="softMoss" x="-12%" y="-12%" width="124%" height="124%">
          <feGaussianBlur stdDeviation="${blur.toFixed(2)}"/>
        </filter>
      </defs>
      <rect width="1200" height="675" fill="${water}"/>
      <text x="58" y="66" font-family="Noto Sans CJK JP, sans-serif" font-size="30" font-weight="700" fill="#102a35">大きさ: ${input.sizeMm.toFixed(2)}mm</text>
      <text x="1142" y="66" text-anchor="end" font-family="Noto Sans CJK JP, sans-serif" font-size="30" font-weight="700" fill="#102a35">${input.ageDays}日目</text>
      <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="url(#moss)" filter="url(#softMoss)"/>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
