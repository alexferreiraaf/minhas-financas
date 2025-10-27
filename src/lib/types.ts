// Type for client-side transaction data
export interface Transaction {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  data: Date;
}
