import type { Timestamp } from 'firebase/firestore';

// Type for client-side transaction data
export interface Transaction {
  id: string;
  userId: string;
  descricao: string;
  valor: number;
  observacao?: string;
  tipo: 'receita' | 'despesa';
  data: Timestamp;
  groupId?: string;
  isParcela?: boolean;
  parcelaId?: string;
  parcelaAtual?: number;
  totalParcelas?: number;
  status: 'pago' | 'pendente';
}

export interface Group {
  id: string;
  userId: string;
  name: string;
  tipo: 'receita' | 'despesa';
}

export interface PredefinedDescription {
  id: string;
  userId: string;
  name: string;
  tipo: 'receita' | 'despesa';
}
