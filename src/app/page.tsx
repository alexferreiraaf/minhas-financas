"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, type Firestore } from 'firebase/firestore';
import { ArrowUp, ArrowDown, CreditCard, Loader, Users, AlertTriangle } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { FIREBASE_CONFIG } from '@/lib/firebase-config';
import type { Transaction, FirestoreTransaction } from '@/lib/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


export default function FinancyCanvas() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [formType, setFormType] = useState<'despesa' | 'receita'>('despesa');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!FIREBASE_CONFIG.projectId) {
      setError("Configuração do Firebase ausente. O aplicativo não pode ser iniciado. Por favor, vincule um projeto Firebase.");
      setIsLoading(false);
      return;
    }
    if (!auth) {
        setError("Falha na inicialização da autenticação do Firebase.");
        setIsLoading(false);
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (e: any) {
          setError(`Falha na autenticação anônima: ${e.message}`);
        }
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const collectionPath = `users/${userId}/transactions`;
    const transactionsCollection = collection(db as Firestore, collectionPath);
    const q = query(transactionsCollection, orderBy('data', 'desc'));

    setIsLoading(true);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTransactions: Transaction[] = snapshot.docs.map(doc => {
        const data = doc.data() as FirestoreTransaction;
        return {
          id: doc.id,
          ...data,
          data: data.data.toDate(),
        };
      });

      const currentBalance = fetchedTransactions.reduce((acc, t) => {
        return t.tipo === 'receita' ? acc + t.valor : acc - t.valor;
      }, 0);

      setTransactions(fetchedTransactions);
      setBalance(currentBalance);
      setIsLoading(false);
      setError('');

    }, (err) => {
      console.error("Erro ao buscar transações: ", err);
      let errorMessage = "Não foi possível carregar as transações. ";
      if (err.message.includes("permission-denied") || err.message.includes("PERMISSION_DENIED")) {
        errorMessage += "Verifique as regras de segurança do Firestore. A regra para leitura pode estar incorreta."
      } else {
        errorMessage += "Verifique sua conexão e a configuração do Firestore."
      }
      setError(errorMessage);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthReady, userId]);

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  }, []);
  
  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    inputValue = inputValue.replace(/\D/g, ''); // Remove non-digits
    inputValue = (Number(inputValue) / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    setValue(inputValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !userId) {
      setError("Sistema não está pronto. Tente novamente.");
      return;
    }

    setIsSubmitting(true);
    const numericValue = parseFloat(value.replace(/\./g, '').replace(',', '.'));

    if (description.trim() === '' || isNaN(numericValue) || numericValue <= 0) {
      setError("Por favor, preencha a descrição e um valor positivo.");
      setIsSubmitting(false);
      return;
    }

    try {
      const transactionData = {
        descricao: description.trim(),
        valor: numericValue,
        tipo: formType,
        data: serverTimestamp(),
      };

      const collectionPath = `users/${userId}/transactions`;
      await addDoc(collection(db, collectionPath), transactionData);

      setDescription('');
      setValue('');
      setShowModal(false);
      setError('');
    } catch (e: any) {
      console.error("Erro ao adicionar transação: ", e);
      let errorMessage = "Erro ao salvar transação. ";
       if (e.message.includes("permission-denied") || e.message.includes("PERMISSION_DENIED")) {
        errorMessage += "Verifique as regras de segurança do Firestore. A regra para escrita pode estar incorreta."
      } else {
        errorMessage += "Tente novamente."
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthReady || (isLoading && isAuthReady)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <Loader className="animate-spin text-primary mb-4" size={48} />
        <p className="text-foreground/80 font-medium">Carregando Finanças...</p>
      </div>
    );
  }
  
  if (error && (!FIREBASE_CONFIG.projectId || error.includes("ausente"))) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Alert variant="destructive" className="max-w-lg">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Configuração Incompleta</AlertTitle>
            <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
            <Button onClick={() => window.location.reload()} className='mt-4'>Vincular Projeto Firebase</Button>
        </Alert>
      </div>
    );
  }


  const BalanceIcon = formType === 'receita' ? ArrowUp : ArrowDown;
  const modalTitle = formType === 'receita' ? 'Adicionar Receita' : 'Adicionar Despesa';
  const modalColor = formType === 'receita' ? 'text-emerald-500' : 'text-red-500';

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8 font-body">
      <div className="max-w-xl mx-auto">
        {error && (
            <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ops! Ocorreu um Erro</AlertTitle>
                <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
            </Alert>
        )}
        <header className="mb-8 p-6 bg-card rounded-2xl shadow-lg border-t-4 border-primary">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-extrabold text-foreground flex items-center">
              <CreditCard className="w-6 h-6 mr-2 text-primary" />
              Financy Canvas
            </h1>
            {userId && (
              <span className="text-xs text-muted-foreground flex items-center">
                <Users className="w-3 h-3 mr-1" />
                ID: {userId.substring(0, 8)}...
              </span>
            )}
          </div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo Atual</h2>
          <p className={`text-4xl font-bold mt-1 transition-colors duration-300 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(balance)}
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <Button
            onClick={() => { setFormType('receita'); setShowModal(true); setError('') }}
            className="w-full p-6 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"
          >
            <ArrowUp className="w-5 h-5 mr-2" />
            Adicionar Receita
          </Button>
          <Button
            onClick={() => { setFormType('despesa'); setShowModal(true); setError('') }}
            className="w-full p-6 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"
          >
            <ArrowDown className="w-5 h-5 mr-2" />
            Adicionar Despesa
          </Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Histórico de Transações</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <CreditCard className="w-10 h-10 mx-auto mb-3" />
                <p>Nenhuma transação registrada.</p>
                <p className='text-sm mt-1'>Comece adicionando uma receita ou despesa.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {transactions.map((t) => (
                  <li
                    key={t.id}
                    className={`flex justify-between items-center p-3 rounded-lg border-l-4 transition-all duration-200 
                      ${t.tipo === 'receita' ? 'border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50' : 'border-red-400 bg-red-50/50 hover:bg-red-50'}`}
                  >
                    <div className="flex items-center">
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 ${t.tipo === 'receita' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                         {t.tipo === 'receita' ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground leading-tight">{t.descricao}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.data.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    <p className={`font-semibold ${t.tipo === 'receita' ? 'text-emerald-600' : 'text-red-600'} flex-shrink-0 ml-4`}>
                      {t.tipo === 'receita' ? '+' : '-'} {formatCurrency(t.valor)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showModal} onOpenChange={(isOpen) => { setShowModal(isOpen); if (!isOpen) setError(''); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className={`text-2xl font-bold ${modalColor}`}>{modalTitle}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
             {error && (
              <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div>
              <Label htmlFor="description" className="text-left">Descrição</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Salário, Aluguel, etc."
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="value" className="text-left">Valor (R$)</Label>
              <Input
                id="value"
                value={value}
                onChange={handleValueChange}
                placeholder="0,00"
                required
                className="mt-1"
                type="text"
                inputMode="decimal"
              />
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className={`${formType === 'receita' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'} text-white`}>
                {isSubmitting ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <BalanceIcon className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
