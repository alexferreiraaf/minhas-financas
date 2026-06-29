import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const ReceiptAnalysisSchema = z.object({
  tipo: z.enum(['receita', 'despesa']),
  descricao: z.string(),
  valor: z.number(),
  data: z.string(),
  observacao: z.string().optional(),
  sugestaoGrupoId: z.string().nullable(),
  categoriaSugerida: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileBase64, fileType, groups } = body;

    if (!fileBase64 || !fileType) {
      return NextResponse.json(
        { message: 'Comprovante não fornecido ou inválido.' },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { message: 'Chave de API do Gemini (GEMINI_API_KEY) não configurada no servidor.' },
        { status: 500 }
      );
    }

    const dataUrl = `data:${fileType};base64,${fileBase64}`;
    const todayStr = new Date().toISOString().split('T')[0];

    const promptText = `
Você é um assistente especializado em contabilidade pessoal brasileira.
Analise a imagem ou PDF do comprovante Pix fornecido e extraia as informações da transação.

Abaixo está a lista de grupos (categorias) existentes do usuário:
${JSON.stringify(groups, null, 2)}

Data de hoje (use como referência caso a data não seja encontrada): ${todayStr}

Siga estritamente estas regras:
1. Identifique o tipo de transação (tipo):
   - O usuário dono da conta se chama **Alex Conceicao Ferreira** (ou **Alex Conceição Ferreira**).
   - Se quem recebeu (recebedor/destinatário) for **Alex Conceicao Ferreira** (ou variação), a transação é SEMPRE "receita" (entrada), pois o dinheiro entrou na conta do usuário (mesmo que o comprovante tenha sido gerado pelo pagador e diga "Pix enviado" ou "Pix realizado").
   - Se quem pagou (pagador/remetente) for **Alex Conceicao Ferreira** (ou variação), a transação é SEMPRE "despesa" (saída).
   - Se não houver identificação clara desses nomes, use a regra geral: Pix enviado/realizado/pagamento é "despesa", e Pix recebido/transferência recebida é "receita".
2. Identifique o nome da descrição (descricao):
   - Se for "despesa", a descrição deve ser o nome da pessoa ou estabelecimento que **recebeu** o dinheiro (ex: "Supermercado X", "João Silva"). Nunca coloque "Alex Conceicao Ferreira" como descrição de despesa.
   - Se for "receita", a descrição deve ser o nome da pessoa ou empresa que **enviou** o dinheiro para o Alex (ex: no comprovante onde o Alex recebeu, a descrição deve ser o nome do pagador, como "Franciele Domingos da Silva"). Nunca coloque "Alex Conceicao Ferreira" como descrição de receita.
3. Extraia o valor numérico exato da transação em reais.
4. Identifique a data da transação e formate no padrão YYYY-MM-DD. Se a data for expressa em termos relativos (ex: "hoje"), use a data de hoje fornecida.
5. Selecione a melhor categoria existente (sugestaoGrupoId):
   - Compare a descrição e contexto da transação com os nomes dos grupos existentes fornecidos acima.
   - Por exemplo, se a transação for em um supermercado ou padaria, e houver um grupo chamado "Alimentação", "Mercado" ou "Padaria", selecione o ID correspondente.
   - Se nenhum grupo existente for compatível ou fizer sentido, defina "sugestaoGrupoId" como null.
6. Forneça uma categoria sugerida (categoriaSugerida):
   - Sugira um nome curto e claro de categoria em português (ex: "Padaria", "Mercado", "Combustível", "Restaurante", "Transporte", "Lazer", "Salário") baseado no local e tipo de gasto.
7. Colete observações úteis (observacao):
   - Adicione informações como o banco de origem/destino e/ou ID da transação se disponíveis.
`;

    let response;
    try {
      response = await ai.generate({
        model: 'googleai/gemini-2.5-flash',
        prompt: [
          { media: { url: dataUrl, contentType: fileType } },
          { text: promptText },
        ],
        output: {
          schema: ReceiptAnalysisSchema,
        },
      });
    } catch (apiError: any) {
      console.warn('Erro ao chamar gemini-2.5-flash, tentando fallback para gemini-2.5-flash-lite:', apiError);
      
      // Fallback to gemini-2.5-flash-lite
      response = await ai.generate({
        model: 'googleai/gemini-2.5-flash-lite',
        prompt: [
          { media: { url: dataUrl, contentType: fileType } },
          { text: promptText },
        ],
        output: {
          schema: ReceiptAnalysisSchema,
        },
      });
    }

    const result = response.output;

    if (!result) {
      return NextResponse.json(
        { message: 'Não foi possível extrair os dados do comprovante.' },
        { status: 422 }
      );
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Erro na análise de comprovante:', error);
    return NextResponse.json(
      { message: error.message || 'Erro interno do servidor ao analisar comprovante.' },
      { status: 500 }
    );
  }
}
