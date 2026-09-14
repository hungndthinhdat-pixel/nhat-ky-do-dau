// Optional feature: reads a number (liters or odo) out of a photo using Claude's vision.
// Only works once ANTHROPIC_API_KEY is set as an environment variable in the Netlify site
// settings. If it's not set, this function simply returns "no value found" and the app
// falls back to manual entry — nothing breaks.

const LITERS_PROMPT = `Đây là ảnh chụp màn hình trụ bơm xăng/dầu ở Việt Nam. Màn hình thường hiển thị 3 dòng số xếp chồng: TỔNG (tổng tiền thanh toán, số lớn), LÍT (số lít vừa bơm, thường có 1-2 chữ số thập phân), và ĐƠN GIÁ (giá tiền mỗi lít). Nhiệm vụ của bạn là tìm đúng dòng SỐ LÍT, không phải tổng tiền và không phải đơn giá.
Chỉ trả lời bằng một JSON object duy nhất, không kèm giải thích, không kèm markdown, không kèm dấu backtick, theo đúng dạng: {"value": <number|null>, "confidence": "high"|"low"}
Nếu không nhìn rõ hoặc không chắc chắn, trả về value: null và confidence: "low".`;

const ODO_PROMPT = `Đây là ảnh chụp bảng đồng hồ hoặc màn hình thông tin của một chiếc xe ô tô. Nhiệm vụ của bạn là tìm số ODO — tức tổng quãng đường xe đã đi được từ lúc xuất xưởng, đơn vị km.
Đặc điểm nhận dạng số ODO:
- Thường là số nguyên khá lớn, thường có 4 đến 7 chữ số (ví dụ 109637, 414481).
- KHÔNG phải số đi kèm "km/h" (đó là tốc độ hiện tại).
- KHÔNG phải số đi kèm "L/100km" (đó là mức tiêu hao nhiên liệu).
- KHÔNG phải số nhỏ đi kèm biểu tượng bình xăng hoặc thể hiện quãng đường CÒN CÓ THỂ đi được (thường dưới 1000, đây là tầm hoạt động dự đoán, không phải odo).
- Không phải "đồng hồ hành trình" (trip meter) nếu có ghi rõ chữ "hành trình" hoặc "trip", trừ khi không có số odo tổng nào khác trong ảnh.
Chỉ trả lời bằng một JSON object duy nhất, không kèm giải thích, không kèm markdown, không kèm dấu backtick, theo đúng dạng: {"value": <number|null>, "confidence": "high"|"low"}
Nếu không nhìn rõ hoặc không chắc chắn, trả về value: null và confidence: "low".`;

const PLATE_PROMPT = `Đây là ảnh chụp phía trước hoặc phía sau một chiếc xe ở Việt Nam, có biển số xe màu vàng hoặc trắng. Nhiệm vụ của bạn là đọc chính xác biển số xe.
Quy tắc:
- Giữ nguyên định dạng có dấu gạch ngang và dấu chấm như in trên biển, ví dụ: "24H-040.86" hoặc "29A-123.45".
- Viết hoa toàn bộ chữ cái.
- Nếu ảnh có nhiều biển số (ví dụ biển số xe khác đi ngang qua), chỉ lấy biển số của xe chính, to và rõ nhất, nằm ở khung phía trước/sau xe.
- Nếu ảnh bị mờ, bị che, hoặc không thấy biển số nào rõ ràng, trả về null.
Chỉ trả lời bằng một JSON object duy nhất, không kèm giải thích, không kèm markdown, không kèm dấu backtick, theo đúng dạng: {"value": <string|null>, "confidence": "high"|"low"}`;

function promptForKind(kind) {
  if (kind === "liters") return LITERS_PROMPT;
  if (kind === "odo") return ODO_PROMPT;
  if (kind === "plate") return PLATE_PROMPT;
  return LITERS_PROMPT;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({ value: null, confidence: "low", note: "ANTHROPIC_API_KEY chưa được cấu hình" }),
    };
  }

  try {
    const { image, kind } = JSON.parse(event.body);
    if (!image || !kind) {
      return { statusCode: 400, body: JSON.stringify({ error: "missing image or kind" }) };
    }

    const base64 = image.split(",")[1];
    const prompt = promptForKind(kind);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    const textBlock = (data.content || []).find((c) => c.type === "text");
    if (!textBlock) return { statusCode: 200, body: JSON.stringify({ value: null, confidence: "low" }) };

    const clean = textBlock.text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    const rawValue = parsed.value;
    const validValue =
      typeof rawValue === "number" || (typeof rawValue === "string" && rawValue.trim() !== "") ? rawValue : null;
    return {
      statusCode: 200,
      body: JSON.stringify({
        value: validValue,
        confidence: parsed.confidence || "low",
      }),
    };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ value: null, confidence: "low", error: String(err) }) };
  }
};
