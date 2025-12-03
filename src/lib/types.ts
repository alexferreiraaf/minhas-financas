import type { Timestamp } from 'firebase/firestore';

// Type for client-side transaction data
export interface Transaction {
  id: string;
  userId: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  data: Timestamp;
  groupId?: string;
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
