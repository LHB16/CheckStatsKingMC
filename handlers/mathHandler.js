/**
 * handlers/mathHandler.js
 * Bộ xử lý tính toán toán học thuần túy (Pure Math Engine)
 * Không sử dụng AI, không dùng eval(), an toàn bảo mật 100%.
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Bản đồ ký tự số mũ trên (Superscript)
 */
const SUPERSCRIPT_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻'
};

/**
 * Chuyển số mũ dạng chuỗi (VD: "+25", "-4") sang dạng ký tự mũ đẹp mắt (VD: "²⁵", "⁻⁴")
 */
function toSuperscript(expStr) {
  return expStr
    .replace(/^\+/, '') // Bỏ dấu + nếu có
    .split('')
    .map(ch => SUPERSCRIPT_MAP[ch] || ch)
    .join('');
}

/**
 * Định dạng số kết quả thông minh:
 * - Khắc phục sai số dấu phẩy động (0.1 + 0.2 = 0.3)
 * - Số rất lớn (>= 10^15) hoặc rất nhỏ gần 0: Dạng khoa học (VD: 1.234567 × 10²⁵)
 * - Số thông thường: Có dấu phẩy phân tách hàng nghìn (VD: 12,345,678.9)
 */
function formatMathNumber(num) {
  if (!Number.isFinite(num)) {
    return String(num);
  }

  // Khắc phục lỗi làm tròn floating point (0.30000000000000004 -> 0.3)
  const precisionNum = parseFloat(num.toPrecision(14));

  const absNum = Math.abs(precisionNum);

  // Số siêu lớn (>= 10^15) hoặc số cực nhỏ gần 0 (nhưng khác 0)
  if (absNum >= 1e15 || (absNum > 0 && absNum < 1e-6)) {
    const expNotation = precisionNum.toExponential(6); // ví dụ: "1.234568e+25"
    const [base, exp] = expNotation.split('e');
    const cleanBase = parseFloat(base).toString(); // Bỏ bớt số 0 thừa ở đuôi base
    const prettyExp = toSuperscript(exp);
    return `${cleanBase} × 10${prettyExp} (${expNotation})`;
  }

  // Số thông thường: Tách phần nguyên và phần thập phân để phân cách hàng nghìn
  const parts = precisionNum.toString().split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 1) {
    return `${integerPart}.${parts[1]}`;
  }
  return integerPart;
}

/**
 * Chuẩn hóa chuỗi biểu thức trước khi phân tích
 */
function normalizeExpression(rawExpr) {
  let expr = rawExpr
    .replace(/[\s=?]+$/, '')               // Bỏ dấu = hoặc ? ở cuối biểu thức (VD: 12*2 = ?)
    .replace(/[\u2013\u2014\u2212]/g, '-') // Chuẩn hóa dấu gạch ngang/dấu trừ unicode
    .replace(/[xX\u00D7\u22C5]/g, '*')      // Chuẩn hóa ký tự nhân x, × sang *
    .replace(/[\:\u00F7]/g, '/')            // Chuẩn hóa ký tự chia :, ÷ sang /
    .replace(/\*\*/g, '^')                  // Chuẩn hóa ** sang ^
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '') // Khử dấu phẩy phân tách hàng nghìn (1,000,000 -> 1000000)
    .replace(/,/g, '.')                     // Chuẩn hóa dấu phẩy thập phân sang dấu chấm (12,5 -> 12.5)
    .replace(/\s+/g, '');                   // Loại bỏ khoảng trắng

  return expr;
}

/**
 * Tách biểu thức thành mảng các Token (Số, Toán tử, Dấu ngoặc)
 */
function tokenize(expr) {
  const tokens = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    // Dấu ngoặc
    if (char === '(' || char === ')') {
      tokens.push({ type: 'PAREN', value: char });
      i++;
      continue;
    }

    // Toán tử
    if (['+', '-', '*', '/', '%', '^'].includes(char)) {
      // Phân biệt dấu trừ âm (Unary Minus) với phép trừ nhị phân:
      // Dấu '-' là Unary nếu nó ở đầu biểu thức, hoặc đứng ngay sau '(' hoặc đứng sau một toán tử khác
      const prevToken = tokens[tokens.length - 1];
      const isUnary = (char === '-' || char === '+') && (
        tokens.length === 0 ||
        prevToken.type === 'OPERATOR' ||
        (prevToken.type === 'PAREN' && prevToken.value === '(')
      );

      if (isUnary) {
        if (char === '-') {
          tokens.push({ type: 'UNARY', value: 'neg' });
        }
        // Dấu '+' đơn lẻ (VD: +5) thì có thể bỏ qua
      } else {
        tokens.push({ type: 'OPERATOR', value: char });
      }
      i++;
      continue;
    }

    // Số (Bao gồm số nguyên, số thập phân và ký hiệu e/E khoa học)
    if (/\d|\./.test(char)) {
      let numStr = '';
      while (i < expr.length && /[\d\.]/.test(expr[i])) {
        numStr += expr[i];
        i++;
      }
      // Hỗ trợ số dạng khoa học: 1e5 hoặc 1.2e-3
      if (i < expr.length && (expr[i] === 'e' || expr[i] === 'E')) {
        let expPart = expr[i];
        i++;
        if (i < expr.length && (expr[i] === '+' || expr[i] === '-')) {
          expPart += expr[i];
          i++;
        }
        while (i < expr.length && /\d/.test(expr[i])) {
          expPart += expr[i];
          i++;
        }
        numStr += expPart;
      }

      const numVal = parseFloat(numStr);
      if (isNaN(numVal)) {
        throw new Error(`Số không hợp lệ: "${numStr}"`);
      }
      tokens.push({ type: 'NUMBER', value: numVal });
      continue;
    }

    throw new Error(`Ký tự không hợp lệ trong biểu thức: "${char}"`);
  }

  return tokens;
}

/**
 * Độ ưu tiên toán tử
 */
const PRECEDENCE = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  '%': 2,
  '^': 3,
  'neg': 4
};

const ASSOCIATIVITY = {
  '+': 'L',
  '-': 'L',
  '*': 'L',
  '/': 'L',
  '%': 'L',
  '^': 'R',
  'neg': 'R'
};

/**
 * Chuyển đổi biểu thức sang dạng Hậu tố (Reverse Polish Notation) bằng Shunting-yard Algorithm
 */
function shuntingYard(tokens) {
  const outputQueue = [];
  const operatorStack = [];

  for (const token of tokens) {
    if (token.type === 'NUMBER') {
      outputQueue.push(token);
    } else if (token.type === 'UNARY') {
      operatorStack.push(token);
    } else if (token.type === 'OPERATOR') {
      const op1 = token.value;
      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1];
        if (top.type === 'PAREN' && top.value === '(') {
          break;
        }

        const op2 = top.value;
        const prec1 = PRECEDENCE[op1];
        const prec2 = PRECEDENCE[op2];

        if (
          (ASSOCIATIVITY[op1] === 'L' && prec1 <= prec2) ||
          (ASSOCIATIVITY[op1] === 'R' && prec1 < prec2)
        ) {
          outputQueue.push(operatorStack.pop());
        } else {
          break;
        }
      }
      operatorStack.push(token);
    } else if (token.type === 'PAREN') {
      if (token.value === '(') {
        operatorStack.push(token);
      } else if (token.value === ')') {
        let foundOpenParen = false;
        while (operatorStack.length > 0) {
          const top = operatorStack.pop();
          if (top.type === 'PAREN' && top.value === '(') {
            foundOpenParen = true;
            break;
          }
          outputQueue.push(top);
        }
        if (!foundOpenParen) {
          throw new Error('Dấu ngoặc đóng ")" không có dấu mở tương ứng!');
        }
      }
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop();
    if (top.type === 'PAREN') {
      throw new Error('Dấu ngoặc mở "(" chưa được đóng!');
    }
    outputQueue.push(top);
  }

  return outputQueue;
}

/**
 * Tính toán biểu thức RPN trên Stack
 */
function evaluateRPN(rpnTokens) {
  const stack = [];

  for (const token of rpnTokens) {
    if (token.type === 'NUMBER') {
      stack.push(token.value);
    } else if (token.type === 'UNARY') {
      if (stack.length < 1) {
        throw new Error('Thiếu số cho toán tử âm!');
      }
      const val = stack.pop();
      stack.push(-val);
    } else if (token.type === 'OPERATOR') {
      if (stack.length < 2) {
        throw new Error(`Thiếu toán hạng cho phép tính "${token.value}"!`);
      }
      const b = stack.pop();
      const a = stack.pop();

      let res = 0;
      switch (token.value) {
        case '+':
          res = a + b;
          break;
        case '-':
          res = a - b;
          break;
        case '*':
          res = a * b;
          break;
        case '/':
          if (b === 0) {
            throw new Error('Không thể chia cho 0 (Division by zero)!');
          }
          res = a / b;
          break;
        case '%':
          if (b === 0) {
            throw new Error('Không thể chia lấy dư cho 0 (Modulo by zero)!');
          }
          res = a % b;
          break;
        case '^':
          // Chống tấn công DoS: Giới hạn số mũ an toàn
          if (Math.abs(b) > 1000) {
            throw new Error(`Số mũ quá lớn (|${b}| > 1,000)! Bot giới hạn số mũ tối đa là 1,000 để chống tràn bộ nhớ.`);
          }
          res = Math.pow(a, b);
          break;
        default:
          throw new Error(`Toán tử không được hỗ trợ: "${token.value}"`);
      }

      stack.push(res);
    }
  }

  if (stack.length !== 1) {
    throw new Error('Cú pháp biểu thức không hợp lệ!');
  }

  const finalResult = stack[0];

  // Kiểm tra kết quả
  if (Number.isNaN(finalResult)) {
    throw new Error('Kết quả tính toán không hợp lệ (NaN)!');
  }

  if (!Number.isFinite(finalResult)) {
    throw new Error('Kết quả vượt quá giới hạn biểu diễn của hệ thống (Tràn số / Overflow)!');
  }

  return finalResult;
}

/**
 * Hàm phân tích và tính toán toàn diện từ chuỗi biểu thức
 * @param {string} rawExpression 
 * @returns {{ success: boolean, result?: number, formattedResult?: string, error?: string }}
 */
function evaluateMath(rawExpression) {
  try {
    if (!rawExpression || !rawExpression.trim()) {
      return {
        success: false,
        error: 'Vui lòng nhập biểu thức toán học cần tính!'
      };
    }

    if (rawExpression.length > 500) {
      return {
        success: false,
        error: 'Độ dài biểu thức quá dài (tối đa 500 ký tự)!'
      };
    }

    const cleanExpr = normalizeExpression(rawExpression);
    if (!cleanExpr) {
      return {
        success: false,
        error: 'Biểu thức trống!'
      };
    }

    const tokens = tokenize(cleanExpr);
    if (tokens.length === 0) {
      return {
        success: false,
        error: 'Không tìm thấy toán hạng hoặc số hợp lệ trong biểu thức!'
      };
    }

    const rpn = shuntingYard(tokens);
    const result = evaluateRPN(rpn);
    const formattedResult = formatMathNumber(result);

    return {
      success: true,
      result,
      formattedResult
    };
  } catch (err) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Xử lý tin nhắn yêu cầu tính toán từ Discord
 * @param {import('discord.js').Message} message 
 * @param {string} expressionText 
 */
async function handleMathMessage(message, expressionText) {
  const botName = message.client.user?.username || 'CheckStatsKingMC';

  // Nếu người dùng không nhập biểu thức, hướng dẫn cú pháp
  if (!expressionText || !expressionText.trim()) {
    const guideEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🧮 HƯỚNG DẪN LỆNH TÍNH TOÁN (MATH)')
      .setDescription(
        `Bot hỗ trợ tính toán toán học thuần túy, an toàn và tức thì!\n\n` +
        `**Cách dùng:**\n` +
        `• Slash Command: \`/math <biểu thức>\`\n` +
        `• Tiền tố: \`?math <biểu thức>\`, \`?calc <biểu thức>\` hoặc \`?<phép tính>\` (VD: \`?12*2\`)\n\n` +
        `**Toán tử hỗ trợ:**\n` +
        `• Cộng (\`+\`), Trừ (\`-\`)\n` +
        `• Nhân (\`*\`, \`x\`), Chia (\`/\`, \`:\`)\n` +
        `• Chia lấy dư (\`%\`), Lũy thừa (\`^\`)\n` +
        `• Dấu ngoặc nhóm: \`( )\`, số âm, số thập phân\n\n` +
        `**Ví dụ mẫu:**\n` +
        `• \`/math expression: 12*2\`\n` +
        `• \`?math (15 + 25) * 4 / 2\`\n` +
        `• \`?2 ^ 16\`\n` +
        `• \`?100 % 7\``
      )
      .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
      .setTimestamp();

    return await message.reply({ embeds: [guideEmbed] });
  }

  // Thực hiện tính toán
  const evalResult = evaluateMath(expressionText);

  if (!evalResult.success) {
    return await message.reply(`⚠️ **Lỗi tính toán:** ${evalResult.error}`);
  }

  // Gửi kết quả
  const resultEmbed = new EmbedBuilder()
    .setColor('#57F287')
    .setTitle('🧮 KẾT QUẢ TÍNH TOÁN')
    .addFields(
      { name: '📥 Biểu thức', value: `\`\`\`math\n${expressionText.trim()}\n\`\`\``, inline: false },
      { name: '📤 Kết quả', value: `\`\`\`yaml\n= ${evalResult.formattedResult}\n\`\`\``, inline: false }
    )
    .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
    .setTimestamp();

  await message.reply({ embeds: [resultEmbed] });
}

/**
 * Kiểm tra xem một chuỗi văn bản có phải là một biểu thức toán học hợp lệ hay không.
 * Tự động loại bỏ các câu chữ thông thường và chỉ chấp nhận khi:
 * 1. Chỉ chứa các ký tự toán học hợp lệ (số, khoảng trắng, toán tử, ngoặc, chấm/phẩy).
 * 2. Có ít nhất một chữ số và ít nhất một toán tử toán học.
 * 3. Cú pháp biểu thức phân tích thành công (hợp lệ theo thuật toán Shunting-yard).
 * @param {string} rawText 
 * @returns {boolean}
 */
function isMathExpression(rawText) {
  if (!rawText || typeof rawText !== 'string') return false;

  // Bỏ khoảng trắng thừa và ký tự kết thúc như = hoặc ? nếu người dùng gõ kiểu: "12*2 = ?" hay "15+5="
  const text = rawText.trim().replace(/[\s=?]+$/, '').trim();
  if (!text) return false;

  // 1. Chỉ chấp nhận các ký tự hợp lệ cho biểu thức toán học:
  // Số 0-9, khoảng trắng, +, -, *, /, %, ^, x, X, :, ÷, ngoặc đơn (), chấm ., phẩy ,, e/E khoa học
  const validMathCharsRegex = /^[\d\s+\-*\/%^xX:\u00D7\u00F7\u2212\u22C5\(\)\.,eE]+$/;
  if (!validMathCharsRegex.test(text)) {
    return false;
  }

  // 2. Bắt buộc phải có ít nhất 1 chữ số
  if (!/\d/.test(text)) {
    return false;
  }

  // 3. Phải có ít nhất 1 toán tử toán học
  // Để tránh nhận nhầm một chuỗi chỉ có 1 số nguyên (VD: "100" hoặc "0")
  const hasOperator = /[+\-*\/%^xX:\u00D7\u00F7\u2212\u22C5]/.test(text);
  if (!hasOperator) {
    return false;
  }

  // 4. Chuẩn hóa và tokenize để kiểm tra tính toàn vẹn cú pháp
  try {
    const cleanExpr = normalizeExpression(text);
    if (!cleanExpr) return false;

    const tokens = tokenize(cleanExpr);
    if (!tokens || tokens.length === 0) return false;

    // Đếm số lượng toán tử nhị phân và số
    const operatorTokens = tokens.filter(t => t.type === 'OPERATOR');
    const numberTokens = tokens.filter(t => t.type === 'NUMBER');

    // Một phép tính tối thiểu phải có 1 toán tử và số hợp lệ
    if (operatorTokens.length === 0 && tokens.filter(t => t.type === 'UNARY').length === 0) {
      return false;
    }
    if (numberTokens.length === 0) {
      return false;
    }

    // Nếu chỉ có 1 số và 1 toán tử unary (như: "-5" hay "+5"), thường người ta chỉ gõ số âm đơn lẻ
    if (numberTokens.length === 1 && operatorTokens.length === 0) {
      return false;
    }

    // Kiểm tra cấu trúc cú pháp bằng Shunting-yard algorithm
    const rpn = shuntingYard(tokens);
    if (!rpn || rpn.length === 0) return false;

    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  evaluateMath,
  formatMathNumber,
  normalizeExpression,
  handleMathMessage,
  isMathExpression
};
