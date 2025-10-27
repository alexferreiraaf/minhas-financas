"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, ArrowDown, CreditCard, Loader, Users, AlertTriangle, PieChart } from 'lucide-react';
import type { Transaction } from '@/lib/types';
import { useCollection, useFirebase, useMemoFirebase, useUser, addDocumentNonBlocking, initiateAnonymousSignIn } from '@/firebase';
import { collection, query, orderBy, serverTimestamp, where } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function FinancyCanvas() {
  const { firestore, auth } = useFirebase();
  const { user, isUserLoading } = useUser();
  
  const transactionsQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      const coll = collection(firestore, 'transactions');
      return query(coll, where('userId', '==', user.uid), orderBy('data', 'desc'));
  }, [firestore, user]);

  const { data: transactions, isLoading: isLoadingTransactions, error: transactionsError } = useCollection<Transaction>(transactionsQuery);

  const [balance, setBalance] = useState(0);
  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [formType, setFormType] = useState<'despesa' | 'receita'>('despesa');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user && auth) {
      initiateAnonymousSignIn(auth);
    }
  }, [isUserLoading, user, auth]);

  useEffect(() => {
    if (transactions) {
      const currentBalance = transactions.reduce((acc, t) => {
        return t.tipo === 'receita' ? acc + t.valor : acc - t.valor;
      }, 0);
      setBalance(currentBalance);
    } else {
      setBalance(0);
    }
  }, [transactions]);

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

    if (!user || !firestore) {
      setError("Autenticação ou banco de dados não estão prontos.");
      return;
    }

    setIsSubmitting(true);
    
    const numericValue = parseFloat(value.replace(/\./g, '').replace(',', '.'));

    if (description.trim() === '' || isNaN(numericValue) || numericValue <= 0) {
      setError("Por favor, preencha a descrição e um valor positivo.");
      setIsSubmitting(false);
      return;
    }

    const newTransaction = {
      userId: user.uid,
      descricao: description.trim(),
      valor: numericValue,
      tipo: formType,
      data: serverTimestamp(),
    };

    const transactionsCollection = collection(firestore, 'transactions');
    addDocumentNonBlocking(transactionsCollection, newTransaction);


    // Limpa o formulário
    setDescription('');
    setValue('');
    setShowModal(false);
    setError('');
    setIsSubmitting(false);
  };

  const openModal = (type: 'receita' | 'despesa') => {
    setFormType(type);
    setShowModal(true);
  }

  const isLoading = isUserLoading || isLoadingTransactions;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <Loader className="animate-spin text-primary mb-4" size={48} />
        <p className="text-foreground/80 font-medium">Carregando Finanças...</p>
      </div>
    );
  }

  const BalanceIcon = formType === 'receita' ? ArrowUp : ArrowDown;
  const modalTitle = formType === 'receita' ? 'Adicionar Receita' : 'Adicionar Despesa';
  const modalColor = formType === 'receita' ? 'text-emerald-500' : 'text-red-500';

  const pageError = transactionsError || error;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8 font-body">
      <div className="max-w-xl mx-auto">
        {pageError && !showModal && (
            <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ops! Ocorreu um Erro</AlertTitle>
                <AlertDescription className="font-mono text-xs">{pageError.message}</AlertDescription>
            </Alert>
        )}
        <header className="mb-8 p-6 bg-card rounded-2xl shadow-lg border-t-4 border-primary">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-extrabold text-foreground flex items-center">
              <CreditCard className="w-6 h-6 mr-2 text-primary" />
              Financy Canvas
            </h1>
            <span className="text-xs text-muted-foreground flex items-center">
              <Users className="w-3 h-3 mr-1" />
              {user ? user.uid.substring(0,6) : '...'}
            </span>
          </div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo Atual</h2>
          <p className={`text-4xl font-bold mt-1 transition-colors duration-300 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(balance)}
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Button
            onClick={() => openModal('receita')}
            className="w-full p-6 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"
          >
            <ArrowUp className="w-5 h-5 mr-2" />
            Entradas
          </Button>
          <Button
            onClick={() => openModal('despesa')}
            className="w-full p-6 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"
          >
            <ArrowDown className="w-5 h-5 mr-2" />
            Saídas
          </Button>
          <Button
            className="w-full p-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"
          >
            <PieChart className="w-5 h-5 mr-2" />
            Relatório
          </Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>Histórico de Transações</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions && transactions.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <CreditCard className="w-10 h-10 mx-auto mb-3" />
                <p>Nenhuma transação registrada.</p>
                <p className='text-sm mt-1'>Comece adicionando uma receita ou despesa.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {transactions && transactions.map((t) => (
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
                          {t.data.toDate().toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', year: 'numeric' })}
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
