import type { Timestamp } from 'firebase/firestore';

// Type for client-side transaction data
export interface Transaction {
  id: string;
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  data: Date;
}

// Type for data as it is stored in Firestore
export interface FirestoreTransaction {
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  data: Timestamp;
}
