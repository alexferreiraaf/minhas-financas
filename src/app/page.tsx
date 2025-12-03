
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, ArrowDown, CreditCard, Loader, Users, AlertTriangle, PieChart, ArrowLeft, Trash2, Search, X, CalendarIcon, MoreHorizontal, PlusCircle, Settings, LogOut, CheckSquare, Clock, Edit, FilterX, FileText } from 'lucide-react';
import type { Transaction, Group, PredefinedDescription } from '@/lib/types';
import { useCollection, useFirebase, useMemoFirebase, useUser, addDocumentNonBlocking, deleteDocumentNonBlocking, signOutUser, setDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, query, doc, where, writeBatch, updateDoc, getDocs } from 'firebase/firestore';
import { format, parse, addMonths, getYear, getMonth, set, isValid, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ThemeToggleButton } from '@/components/theme-toggle';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


export default function FinancyCanvas() {
  const { firestore, auth } = useFirebase();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();
  
  useEffect(() => {
    if (!isUserLoading && !user) {
      window.location.href = '/login';
    }
  }, [isUserLoading, user]);

  const transactionsQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      return query(collection(firestore, 'users', user.uid, 'transactions'));
  }, [firestore, user]);

  const groupsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'users', user.uid, 'groups'));
  }, [firestore, user]);

  const descriptionsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, 'users', user.uid, 'predefinedDescriptions'));
  }, [firestore, user]);


  const { data: rawTransactions, isLoading: isLoadingTransactions, error: transactionsError } = useCollection<Transaction>(transactionsQuery);
  const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsQuery);
  const { data: allDescriptions, isLoading: isLoadingDescriptions } = useCollection<PredefinedDescription>(descriptionsQuery);


  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [showDescriptionsModal, setShowDescriptionsModal] = useState(false);
  const [reportView, setReportView] = useState<'summary' | 'all' | 'despesas' | 'receitas' | 'parcelas'>('summary');
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [transactionToEdit, setTransactionToEdit] = useState<Transaction | null>(null);
  const [installmentToDelete, setInstallmentToDelete] = useState<Transaction | null>(null);
  const [formType, setFormType] = useState<'despesa' | 'receita'>('despesa');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newDescriptionName, setNewDescriptionName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [observation, setObservation] = useState('');
  const [referenceMonth, setReferenceMonth] = useState<string | undefined>(undefined);
  
  // State for installments
  const [installmentTotalValue, setInstallmentTotalValue] = useState('');
  const [installmentCount, setInstallmentCount] = useState('');

  // State for report filtering
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [reportMonth, setReportMonth] = useState<number>(getMonth(new Date()));
  const [reportYear, setReportYear] = useState<number>(getYear(new Date()));
  
  // State for installment report filtering
  const [installmentGroupFilter, setInstallmentGroupFilter] = useState<string>('all');
  const [installmentNameFilter, setInstallmentNameFilter] = useState<string>('all');

  const groupMap = useMemo(() => {
    if (!allGroups) return new Map();
    return new Map(allGroups.map(g => [g.id, g.name]));
  }, [allGroups]);
  
  const { receitaGroups, despesaGroups } = useMemo(() => {
    if (!allGroups) return { receitaGroups: [], despesaGroups: [] };
    return {
      receitaGroups: allGroups.filter(g => g.tipo === 'receita'),
      despesaGroups: allGroups.filter(g => g.tipo === 'despesa'),
    };
  }, [allGroups]);

  const { receitaDescriptions, despesaDescriptions } = useMemo(() => {
    if (!allDescriptions) return { receitaDescriptions: [], despesaDescriptions: [] };
    return {
      receitaDescriptions: allDescriptions.filter(d => d.tipo === 'receita'),
      despesaDescriptions: allDescriptions.filter(d => d.tipo === 'despesa'),
    };
  }, [allDescriptions]);

  // Client-side sorting because orderBy is not in the query
  const transactions = useMemo(() => {
    if (!rawTransactions) return [];
    return [...rawTransactions].sort((a, b) => {
        const dateA = a.data?.toDate() || new Date(0);
        const dateB = b.data?.toDate() || new Date(0);
        return dateB.getTime() - dateA.getTime();
    });
  }, [rawTransactions]);

  const installments = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => t.isParcela).sort((a, b) => {
        const dateA = a.data?.toDate() || new Date(0);
        const dateB = b.data?.toDate() || new Date(0);
        return dateA.getTime() - dateB.getTime();
    });
  }, [transactions]);


  const recentTransactions = useMemo(() => transactions.filter(t => t.status === 'pago').slice(0, 5), [transactions]);

  const { balance, totalReceitas, totalDespesas, despesas, receitas } = useMemo(() => {
    if (!transactions) {
      return { balance: 0, totalReceitas: 0, totalDespesas: 0, despesas: [], receitas: [] };
    }
    const paidTransactions = transactions.filter(t => t.status === 'pago');
    const receitasTransactions = paidTransactions.filter(t => t.tipo === 'receita');
    const receitasTotal = receitasTransactions.reduce((acc, t) => acc + t.valor, 0);
    const despesasTransations = paidTransactions.filter(t => t.tipo === 'despesa');
    const despesasTotal = despesasTransations.reduce((acc, t) => acc + t.valor, 0);
    const currentBalance = receitasTotal - despesasTotal;
    return { 
      balance: currentBalance, 
      totalReceitas: receitasTotal, 
      totalDespesas: despesasTotal, 
      despesas: transactions.filter(t => t.tipo === 'despesa'), // for reports, we use all
      receitas: transactions.filter(t => t.tipo === 'receita')
    };
  }, [transactions]);

  const monthlyData = useMemo(() => {
    if (!transactions) return [];

    const grouped: { [key: string]: { monthLabel: string; transactions: Transaction[]; totalReceitas: number; totalDespesas: number; }} = {};
    const paidTransactions = transactions.filter(t => t.status === 'pago');

    paidTransactions.forEach(t => {
      const transactionDate = t.data?.toDate();
      if (!transactionDate) return;

      const monthKey = format(transactionDate, 'yyyy-MM');
      if (!grouped[monthKey]) {
        grouped[monthKey] = {
          monthLabel: format(startOfMonth(transactionDate), 'MMMM de yyyy', { locale: ptBR }),
          transactions: [],
          totalReceitas: 0,
          totalDespesas: 0,
        };
      }
      
      grouped[monthKey].transactions.push(t);
      if (t.tipo === 'receita') {
        grouped[monthKey].totalReceitas += t.valor;
      } else {
        grouped[monthKey].totalDespesas += t.valor;
      }
    });

    return Object.keys(grouped).sort().reverse().map(key => ({
      key,
      ...grouped[key],
      saldo: grouped[key].totalReceitas - grouped[key].totalDespesas
    }));
  }, [transactions]);
  
  const filterTransactionsByPeriod = useCallback(<T extends Transaction>(items: T[], month: number, year: number, searchTerm: string) => {
      let filtered = items;

      if (searchTerm) {
          filtered = filtered.filter(d => d.descricao.toLowerCase().includes(searchTerm.toLowerCase()));
      }

      filtered = filtered.filter(d => {
          const transactionDate = d.data?.toDate();
          if (!transactionDate) return false;
          return getMonth(transactionDate) === month && getYear(transactionDate) === year;
      });

      return filtered;
  }, []);
  
  const filteredAllTransactions = useMemo(() => {
    return filterTransactionsByPeriod(transactions, reportMonth, reportYear, reportSearchTerm);
  }, [transactions, reportMonth, reportYear, reportSearchTerm, filterTransactionsByPeriod]);

  const filteredDespesas = useMemo(() => {
    return filterTransactionsByPeriod(despesas, reportMonth, reportYear, reportSearchTerm);
  }, [despesas, reportMonth, reportYear, reportSearchTerm, filterTransactionsByPeriod]);

  const filteredReceitas = useMemo(() => {
    return filterTransactionsByPeriod(receitas, reportMonth, reportYear, reportSearchTerm);
  }, [receitas, reportMonth, reportYear, reportSearchTerm, filterTransactionsByPeriod]);

  const filteredInstallments = useMemo(() => {
    let filtered = filterTransactionsByPeriod(installments, reportMonth, reportYear, reportSearchTerm);
  
    if (installmentGroupFilter !== 'all') {
        filtered = filtered.filter(item => item.groupId === installmentGroupFilter);
    }

    if (installmentNameFilter !== 'all') {
        // The description of an installment is "Name (1/12)", so we check if it starts with the filter name.
        filtered = filtered.filter(item => item.descricao.startsWith(installmentNameFilter));
    }

    return filtered;
  }, [installments, reportMonth, reportYear, reportSearchTerm, filterTransactionsByPeriod, installmentGroupFilter, installmentNameFilter]);

  const uniqueYears = useMemo(() => {
    if (!transactions) return [getYear(new Date())];
    const years = new Set(transactions.map(t => getYear(t.data.toDate())));
    return Array.from(years).sort((a,b) => b-a);
  }, [transactions]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: i,
      label: format(new Date(0, i), 'MMMM', { locale: ptBR }),
    }));
  }, []);

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

  const handleInstallmentValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    inputValue = inputValue.replace(/\D/g, ''); // Remove non-digits
    inputValue = (Number(inputValue) / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    setInstallmentTotalValue(inputValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;
    setIsSubmitting(true);
    const numericValue = parseFloat(value.replace(/\./g, '').replace(',', '.'));
    if (description.trim() === '' || isNaN(numericValue) || numericValue <= 0 || !date) {
      setError("Por favor, preencha todos os campos com valores válidos.");
      setIsSubmitting(false);
      return;
    }

    let finalObservation = observation.trim();
    if (formType === 'despesa' && referenceMonth && referenceMonth !== 'none') {
        const monthLabel = months.find(m => String(m.value) === referenceMonth)?.label;
        const year = getYear(date);
        const refText = `Ref. ${monthLabel}/${year}`;
        finalObservation = finalObservation ? `${refText} - ${finalObservation}` : refText;
    }

    const transactionData: Omit<Transaction, 'id' | 'data'> & { data: Date } = {
        userId: user.uid,
        descricao: description.trim(),
        valor: numericValue,
        tipo: formType,
        data: date,
        status: 'pago',
        ...(finalObservation && { observacao: finalObservation }),
        ...(selectedGroupId && selectedGroupId !== 'none' && { groupId: selectedGroupId }),
        isParcela: false,
    };
    
    if (transactionToEdit) {
      const transactionRef = doc(firestore, 'users', user.uid, 'transactions', transactionToEdit.id);
      updateDocumentNonBlocking(transactionRef, transactionData);
      toast({ title: "Sucesso!", description: "Sua transação foi atualizada." });
    } else {
      const userTransactionsCollection = collection(firestore, 'users', user.uid, 'transactions');
      addDocumentNonBlocking(userTransactionsCollection, transactionData);
      toast({ title: "Sucesso!", description: "Sua transação foi adicionada." });
    }

    resetAndCloseModal();
  };

  const handleInstallmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore) return;

    setIsSubmitting(true);

    const totalValue = parseFloat(installmentTotalValue.replace(/\./g, '').replace(',', '.'));
    const count = parseInt(installmentCount, 10);
    const firstDate = date || new Date();

    if (description.trim() === '' || isNaN(totalValue) || totalValue <= 0 || isNaN(count) || count <= 0 || !firstDate) {
        setError("Por favor, preencha todos os campos do parcelamento com valores válidos.");
        setIsSubmitting(false);
        return;
    }

    const installmentValue = parseFloat((totalValue / count).toFixed(2));
    const parcelaId = doc(collection(firestore, 'temp')).id; // unique ID for the installment group
    const batch = writeBatch(firestore);

    for (let i = 0; i < count; i++) {
        const transactionDate = addMonths(firstDate, i);
        const transactionRef = doc(collection(firestore, 'users', user.uid, 'transactions'));
        
        const newTransaction: Omit<Transaction, 'id' | 'data'> & { data: Date } = {
            userId: user.uid,
            descricao: `${description.trim()} (${i + 1}/${count})`,
            valor: installmentValue,
            tipo: 'despesa',
            data: transactionDate,
            isParcela: true,
            parcelaId: parcelaId,
            parcelaAtual: i + 1,
            totalParcelas: count,
            status: 'pendente',
            ...(selectedGroupId && selectedGroupId !== 'none' && { groupId: selectedGroupId }),
        };
        batch.set(transactionRef, newTransaction);
    }

    await batch.commit();

    toast({ title: "Sucesso!", description: "Sua compra parcelada foi adicionada." });
    resetAndCloseInstallmentModal();
  };


  const handleDeleteTransaction = () => {
    if (!user || !firestore || !transactionToDelete) return;
    const transactionRef = doc(firestore, 'users', user.uid, 'transactions', transactionToDelete);
    deleteDocumentNonBlocking(transactionRef);
    setTransactionToDelete(null);
    toast({ title: "Excluído!", description: "A transação foi removida." });
  };
  
  const handleDeleteInstallment = async () => {
    if (!user || !firestore || !installmentToDelete || !installmentToDelete.parcelaId) return;

    try {
        const userTransactionsCollection = collection(firestore, 'users', user.uid, 'transactions');
        const q = query(userTransactionsCollection, where("parcelaId", "==", installmentToDelete.parcelaId));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            toast({ variant: "destructive", title: "Erro", description: "Nenhuma parcela encontrada para exclusão." });
            setInstallmentToDelete(null);
            return;
        }

        const batch = writeBatch(firestore);
        querySnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        toast({
            title: "Excluído!",
            description: "A compra parcelada foi removida com sucesso.",
        });
    } catch (e) {
        console.error("Erro ao excluir parcelamento:", e);
        toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível excluir o parcelamento.",
        });
    } finally {
        setInstallmentToDelete(null);
    }
  };


  const handleMarkAsPaid = async (transactionId: string) => {
    if (!user || !firestore) return;
    const transactionRef = doc(firestore, 'users', user.uid, 'transactions', transactionId);
    try {
        await updateDoc(transactionRef, { status: 'pago' });
        toast({
            title: "Parcela paga!",
            description: "A parcela foi marcada como paga e o valor foi abatido do seu saldo.",
        });
    } catch (e) {
        console.error("Erro ao marcar parcela como paga:", e);
        toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível atualizar o status da parcela.",
        });
    }
  };


  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || newGroupName.trim() === '') return;
    const newGroup = { userId: user.uid, name: newGroupName.trim(), tipo: formType };
    const userGroupsCollection = collection(firestore, 'users', user.uid, 'groups');
    addDocumentNonBlocking(userGroupsCollection, newGroup);
    setNewGroupName('');
  };

  const handleDeleteGroup = (groupId: string) => {
      if (!user || !firestore) return;
      const groupRef = doc(firestore, 'users', user.uid, 'groups', groupId);
      deleteDocumentNonBlocking(groupRef);
  };

  const handleAddDescription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || newDescriptionName.trim() === '') return;
    const newDescription = { userId: user.uid, name: newDescriptionName.trim(), tipo: formType };
    const userDescriptionsCollection = collection(firestore, 'users', user.uid, 'predefinedDescriptions');
    addDocumentNonBlocking(userDescriptionsCollection, newDescription);
    setNewDescriptionName('');
  };

  const handleDeleteDescription = (descriptionId: string) => {
      if (!user || !firestore) return;
      const descriptionRef = doc(firestore, 'users', user.uid, 'predefinedDescriptions', descriptionId);
      deleteDocumentNonBlocking(descriptionRef);
  };

  const resetAndCloseModal = () => {
    setDescription(''); 
    setValue(''); 
    setDate(new Date()); 
    setSelectedGroupId(null); 
    setObservation(''); 
    setReferenceMonth(undefined); 
    setTransactionToEdit(null);
    setShowModal(false); 
    setError(''); 
    setIsSubmitting(false);
  }
  
  const resetAndCloseInstallmentModal = () => {
    setDescription('');
    setInstallmentTotalValue('');
    setInstallmentCount('');
    setDate(new Date());
    setSelectedGroupId(null);
    setShowInstallmentModal(false);
    setError('');
    setIsSubmitting(false);
  }
  
  const openModalForNew = (type: 'receita' | 'despesa') => {
    setTransactionToEdit(null);
    setFormType(type);
    setShowModal(true);
  }
  
  const openModalForEdit = (transaction: Transaction) => {
    if (transaction.isParcela) {
      toast({
        variant: "destructive",
        title: "Ação não permitida",
        description: "A edição de parcelas individuais não é suportada. Exclua o parcelamento e crie um novo se necessário.",
      });
      return;
    }
    setTransactionToEdit(transaction);
    setFormType(transaction.tipo);
    setDescription(transaction.descricao);
    setValue(transaction.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    
    let transactionDate = transaction.data?.toDate();
    if (transactionDate && isValid(transactionDate)) {
      setDate(transactionDate);
    } else {
      setDate(new Date());
    }
    
    setSelectedGroupId(transaction.groupId || null);
    setObservation(transaction.observacao || '');
    setShowModal(true);
  };

  const openInstallmentModal = () => {
    setFormType('despesa'); // Installments are always expenses
    setShowInstallmentModal(true);
  }

  const openReport = (view: typeof reportView = 'summary') => {
    setReportMonth(getMonth(new Date()));
    setReportYear(getYear(new Date()));
    setReportView(view);
    setShowReportModal(true);
  };

  const isLoading = isUserLoading || isLoadingTransactions || isLoadingGroups || isLoadingDescriptions || !user;
  
  const handleCloseReportModal = () => {
    setShowReportModal(false);
    setTimeout(() => { 
        setReportView('summary'); 
        setReportSearchTerm(''); 
        setInstallmentGroupFilter('all');
        setInstallmentNameFilter('all');
    }, 300);
  };
  
  const handleLogout = () => {
    if (auth) signOutUser(auth);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background">
        <Loader className="animate-spin text-primary mb-4" size={48} />
        <p className="text-foreground/80 font-medium">Carregando Finanças...</p>
      </div>
    );
  }

  const BalanceIcon = formType === 'receita' ? ArrowUp : ArrowDown;
  const modalTitle = transactionToEdit ? `Editar ${transactionToEdit.tipo === 'receita' ? 'Receita' : 'Despesa'}` : `Adicionar ${formType === 'receita' ? 'Receita' : 'Despesa'}`;
  const modalColor = formType === 'receita' ? 'text-emerald-500' : 'text-red-500';

  const pageError = transactionsError || error;

  const renderReportHeader = () => {
    if (reportView === 'summary') {
        return (
            <>
                <DialogTitle className="text-2xl font-bold text-primary">Relatório Financeiro</DialogTitle>
                <DialogDescription>Resumo das suas movimentações financeiras.</DialogDescription>
            </>
        );
    }
    const titleMap: Record<typeof reportView, string> = {
        'summary': "Relatório",
        'all': "Todos os Lançamentos",
        'despesas': "Relatório de Despesas",
        'receitas': "Relatório de Receitas",
        'parcelas': "Relatório de Parcelas"
    };
    const colorMap: Record<typeof reportView, string> = {
        'summary': "text-foreground",
        'all': "text-primary",
        'despesas': "text-red-500",
        'receitas': "text-emerald-500",
        'parcelas': "text-sky-500"
    };
    const title = titleMap[reportView];
    const color = colorMap[reportView];
    return (
        <div className="flex items-center">
            <Button variant="ghost" size="icon" className="mr-2" onClick={() => setReportView('summary')}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <DialogTitle className={`text-2xl font-bold ${color}`}>{title}</DialogTitle>
        </div>
    );
  };

  const renderGenericReport = (items: Transaction[], title: 'transação' | 'receita' | 'despesa') => {
      const total = items.reduce((acc, d) => acc + (d.tipo === 'receita' ? d.valor : -d.valor), 0);
      return (
        <div className="py-4 pr-2">
            <div className="flex flex-col space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <Select value={String(reportMonth)} onValueChange={(v) => setReportMonth(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(reportYear)} onValueChange={(v) => setReportYear(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{uniqueYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                 <Button 
                    variant="link" 
                    size="sm" 
                    className="text-primary self-start -mt-2" 
                    onClick={() => { setReportMonth(getMonth(new Date())); setReportYear(getYear(new Date())); }}>
                    Ir para o mês atual
                </Button>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder={`Filtrar por descrição...`} value={reportSearchTerm} onChange={(e) => setReportSearchTerm(e.target.value)} className="pl-10" />
                    {reportSearchTerm && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setReportSearchTerm('')}><X className="h-4 w-4"/></Button>}
                </div>
                 {title === 'transação' && (
                  <div className={`flex justify-between items-center p-3 bg-muted/50 rounded-lg`}>
                      <span className={`font-medium text-foreground`}>Balanço Filtrado</span>
                      <span className={`font-bold text-lg ${total >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(total)}</span>
                  </div>
                )}
                <div className="max-h-[40vh] overflow-y-auto pr-2">
                  {items.length > 0 ? (
                    <ul className="space-y-3">
                        {items.map(d => {
                          const isIncome = d.tipo === 'receita';
                          const color = isIncome ? 'emerald' : 'red';
                          return (
                            <li key={d.id} className={`group flex justify-between items-start p-3 bg-card border-l-4 border-${color}-400 rounded-lg`}>
                                <div className="flex items-center min-w-0">
                                    <div className="mr-3">{d.status === 'pago' ? <CheckSquare className={`h-5 w-5 text-emerald-500`} /> : <Clock className={`h-5 w-5 text-amber-500`} />}</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{d.descricao}</p>
                                        {d.groupId && groupMap.get(d.groupId) && (<span className="text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full mt-1 inline-block">{groupMap.get(d.groupId)}</span>)}
                                        <p className="text-xs text-muted-foreground mt-1">{d.data?.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                                <div className="flex items-center flex-shrink-0">
                                  <p className={`font-semibold text-${color}-600 dark:text-${color}-400 whitespace-nowrap ml-4`}>{isIncome ? '+' : '-'} {formatCurrency(d.valor)}</p>
                                  {!d.isParcela && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8 ml-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openModalForEdit(d)}><Edit className="h-4 w-4" /></Button>
                                  )}
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => d.isParcela ? setInstallmentToDelete(d) : setTransactionToDelete(d.id)}><Trash2 className="h-4 w-4" /></Button>
                                </div>
                            </li>
                        )})}
                    </ul>
                  ) : <div className="text-center py-10 text-muted-foreground"><p>Nenhuma {title} encontrada para os filtros.</p></div>}
                </div>
            </div>
        </div>
    );
  };
  
  const renderInstallmentsReport = () => {
    return (
        <div className="py-4 pr-2">
            <div className="flex flex-col space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Select value={installmentGroupFilter} onValueChange={setInstallmentGroupFilter}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por grupo..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os Grupos</SelectItem>
                            {despesaGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                     <Select value={installmentNameFilter} onValueChange={setInstallmentNameFilter}>
                        <SelectTrigger><SelectValue placeholder="Filtrar por nome..." /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos os Nomes</SelectItem>
                            {despesaDescriptions.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                 {(installmentGroupFilter !== 'all' || installmentNameFilter !== 'all') && (
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-primary self-start" 
                        onClick={() => { setInstallmentGroupFilter('all'); setInstallmentNameFilter('all'); }}>
                        <FilterX className="mr-2 h-4 w-4" />
                        Limpar Filtros
                    </Button>
                )}
                 <div className="grid grid-cols-2 gap-2">
                    <Select value={String(reportMonth)} onValueChange={(v) => setReportMonth(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(reportYear)} onValueChange={(v) => setReportYear(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{uniqueYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                 <Button 
                    variant="link" 
                    size="sm" 
                    className="text-primary self-start -mt-2" 
                    onClick={() => { setReportMonth(getMonth(new Date())); setReportYear(getYear(new Date())); }}>
                    Ir para o mês atual
                </Button>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar na lista..." value={reportSearchTerm} onChange={(e) => setReportSearchTerm(e.target.value)} className="pl-10" />
                    {reportSearchTerm && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setReportSearchTerm('')}><X className="h-4 w-4"/></Button>}
                </div>
                <div className="max-h-[45vh] overflow-y-auto pr-2">
                    {filteredInstallments.length > 0 ? (
                        <ul className="space-y-3">
                            {filteredInstallments.map(item => (
                                <li key={item.id} className={`group flex justify-between items-center p-3 bg-card border-l-4 rounded-lg ${item.status === 'pago' ? 'border-emerald-400' : 'border-amber-400'}`}>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-foreground truncate">{item.descricao}</p>
                                        {item.groupId && groupMap.get(item.groupId) && (<span className="text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full mt-1 inline-block">{groupMap.get(item.groupId)}</span>)}
                                        <p className="text-xs text-muted-foreground mt-1">{format(item.data.toDate(), 'dd/MM/yyyy')} - {formatCurrency(item.valor)}</p>
                                    </div>
                                    <div className="flex items-center ml-2">
                                        {item.status === 'pendente' ? (
                                            <Button size="sm" variant="outline" className="h-8 text-xs text-emerald-600 border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700" onClick={() => handleMarkAsPaid(item.id)}>
                                                <CheckSquare className="mr-2 h-4 w-4"/> Pagar
                                            </Button>
                                        ) : (
                                            <div className="flex items-center text-xs font-semibold text-emerald-600 px-2">
                                                <CheckSquare className="mr-1.5 h-4 w-4"/> Pago
                                            </div>
                                        )}
                                        <Button size="icon" variant="ghost" className="h-8 w-8 ml-1 text-muted-foreground hover:text-destructive" onClick={() => setInstallmentToDelete(item)}>
                                            <Trash2 className="h-4 w-4"/>
                                            <span className="sr-only">Excluir Parcelamento</span>
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : <div className="text-center py-10 text-muted-foreground"><p>Nenhuma parcela encontrada para os filtros selecionados.</p></div>}
                </div>
            </div>
        </div>
    );
  };

  const groupsForForm = formType === 'receita' ? receitaGroups : despesaGroups;
  const descriptionsForForm = formType === 'receita' ? receitaDescriptions : despesaDescriptions;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8 font-body">
      <div className="max-w-4xl mx-auto">
        {pageError && !showModal && <Alert variant="destructive" className="mb-4"><AlertTriangle className="h-4 w-4" /><AlertTitle>Ops! Ocorreu um Erro</AlertTitle><AlertDescription className="font-mono text-xs">{typeof pageError === 'string' ? pageError : pageError.message}</AlertDescription></Alert>}
        
        <header className="mb-8 p-4 sm:p-6 bg-card rounded-2xl shadow-lg border-t-4 border-primary">
          <div className="flex justify-between items-start sm:items-center mb-4 flex-col sm:flex-row">
            <h1 className="text-2xl font-extrabold text-foreground flex items-center mb-2 sm:mb-0"><CreditCard className="w-6 h-6 mr-2 text-primary" />Minhas Finanças</h1>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-muted-foreground flex items-center" title={user?.email || user?.uid}><Users className="w-3 h-3 mr-1" />{user?.email || user?.uid.substring(0,10)}</span>
              <ThemeToggleButton />
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair"><LogOut className="w-4 h-4" /></Button>
            </div>
          </div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saldo Atual (Pago)</h2>
          <p className={`text-4xl font-bold mt-1 transition-colors duration-300 ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(balance)}</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Button onClick={() => openModalForNew('receita')} className="p-6 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"><ArrowUp className="w-5 h-5 mr-2" />Entradas</Button>
          <Button onClick={() => openModalForNew('despesa')} className="p-6 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"><ArrowDown className="w-5 h-5 mr-2" />Saídas</Button>
          <Button onClick={openInstallmentModal} className="p-6 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"><PlusCircle className="w-5 h-5 mr-2" />Lançar Parcelados</Button>
          <Button onClick={() => openReport('summary')} className="p-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"><FileText className="w-5 h-5 mr-2" />Relatórios</Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle>Visão Geral Mensal</CardTitle><CardDescription>Lançamentos pagos, agrupados por mês.</CardDescription></div>
            <Button variant="ghost" size="sm" onClick={() => openReport('all')}><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Ver relatório completo</span></Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {monthlyData.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                    <PieChart className="w-10 h-10 mx-auto mb-3" />
                    <p>Nenhum dado para exibir.</p>
                    <p className='text-sm mt-1'>Adicione transações para começar a visualizar.</p>
                </div>
            ) : (
                <Accordion type="single" collapsible defaultValue={monthlyData[0]?.key}>
                    {monthlyData.map(month => (
                        <AccordionItem value={month.key} key={month.key}>
                            <AccordionTrigger>
                                <div className="flex justify-between items-center w-full pr-4">
                                    <span className="font-semibold text-lg capitalize">{month.monthLabel}</span>
                                    <div className="flex items-center space-x-4 text-sm">
                                        <span className="text-emerald-500">{formatCurrency(month.totalReceitas)}</span>
                                        <span className="text-red-500">-{formatCurrency(month.totalDespesas)}</span>
                                        <span className={`font-bold ${month.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(month.saldo)}</span>
                                    </div>
                                </div>
                            </AccordionTrigger>
                            <AccordionContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead className="text-right">Data</TableHead>
                                            <TableHead className="text-right">Valor</TableHead>
                                            <TableHead className="w-[80px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {month.transactions.map(t => (
                                            <TableRow key={t.id} className="group">
                                                <TableCell>
                                                    <p className="font-medium truncate max-w-[200px] sm:max-w-xs">{t.descricao}</p>
                                                    {t.groupId && groupMap.get(t.groupId) && <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full mt-1 inline-block">{groupMap.get(t.groupId)}</span>}
                                                </TableCell>
                                                <TableCell className="text-right text-muted-foreground text-xs">{format(t.data.toDate(), 'dd/MM/yy')}</TableCell>
                                                <TableCell className={`text-right font-medium ${t.tipo === 'receita' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                    {t.tipo === 'receita' ? '+' : '-'} {formatCurrency(t.valor)}
                                                </TableCell>
                                                <TableCell className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <div className="flex items-center justify-end">
                                                        {!t.isParcela && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModalForEdit(t)}><Edit className="h-4 w-4" /></Button>}
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => t.isParcela ? setInstallmentToDelete(t) : setTransactionToDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </AccordionContent>
                        </AccordionItem>
                    ))}
                </Accordion>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showModal} onOpenChange={(isOpen) => { if (!isOpen) { resetAndCloseModal() } else { setShowModal(true) } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle className={`text-2xl font-bold ${modalColor}`}>{modalTitle}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
             {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Erro</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <div>
              <Label htmlFor="description" className="text-left">Nome da {formType === 'receita' ? 'Entrada' : 'Saída'}</Label>
              <div className="flex items-center space-x-2 mt-1">
                <Select onValueChange={setDescription} value={description}><SelectTrigger id="description"><SelectValue placeholder="Selecione um nome" /></SelectTrigger><SelectContent>{descriptionsForForm?.map((desc) => <SelectItem key={desc.id} value={desc.name}>{desc.name}</SelectItem>)}</SelectContent></Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setShowDescriptionsModal(true)}><Settings className="h-4 w-4" /><span className="sr-only">Gerenciar Nomes</span></Button>
              </div>
            </div>
            <div>
              <Label htmlFor="group">Grupo</Label>
              <div className="flex items-center space-x-2 mt-1">
                <Select onValueChange={(value) => setSelectedGroupId(value === 'none' ? null : value)} value={selectedGroupId || 'none'}><SelectTrigger id="group"><SelectValue placeholder="Selecione um grupo (opcional)" /></SelectTrigger><SelectContent><SelectItem value="none">Nenhum grupo</SelectItem>{groupsForForm?.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent></Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setShowGroupsModal(true)}><Settings className="h-4 w-4" /><span className="sr-only">Gerenciar Grupos</span></Button>
              </div>
            </div>
            <div>
              <Label htmlFor="value" className="text-left">Valor (R$)</Label>
              <Input id="value" value={value} onChange={handleValueChange} placeholder="0,00" required className="mt-1" type="text" inputMode="decimal"/>
            </div>
            <div>
                <Label htmlFor="date" className="text-left">Data</Label>
                <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-1", !date && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus locale={ptBR} /></PopoverContent></Popover>
            </div>
             {formType === 'despesa' && (
              <>
                <div>
                  <Label htmlFor="reference-month">Mês de Referência (Opcional)</Label>
                  <Select onValueChange={setReferenceMonth} value={referenceMonth}>
                      <SelectTrigger id="reference-month" className="mt-1">
                          <SelectValue placeholder="Selecione o mês da conta" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                      </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="observation" className="text-left">Observação</Label>
                  <Textarea id="observation" value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Adicione uma anotação (opcional)" className="mt-1" />
                </div>
              </>
            )}
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={resetAndCloseModal}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className={`${formType === 'receita' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'} text-white`}>{isSubmitting ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <BalanceIcon className="mr-2 h-4 w-4" />}Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showInstallmentModal} onOpenChange={(isOpen) => { if (!isOpen) { resetAndCloseInstallmentModal() } else { setShowInstallmentModal(true) } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle className="text-2xl font-bold text-sky-500">Adicionar Compra Parcelada</DialogTitle></DialogHeader>
          <form onSubmit={handleInstallmentSubmit} className="space-y-4 pt-4">
            {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Erro</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <div>
              <Label htmlFor="installment-description">Nome da Compra</Label>
              <div className="flex items-center space-x-2 mt-1">
                <Select onValueChange={setDescription} value={description}><SelectTrigger id="installment-description"><SelectValue placeholder="Selecione ou digite um nome" /></SelectTrigger><SelectContent>{despesaDescriptions?.map((desc) => <SelectItem key={desc.id} value={desc.name}>{desc.name}</SelectItem>)}</SelectContent></Select>
                <Button type="button" variant="outline" size="icon" onClick={() => { setFormType('despesa'); setShowDescriptionsModal(true);}}><Settings className="h-4 w-4" /><span className="sr-only">Gerenciar Nomes</span></Button>
              </div>
            </div>
            <div>
              <Label htmlFor="installment-group">Grupo</Label>
              <div className="flex items-center space-x-2 mt-1">
                <Select onValueChange={(value) => setSelectedGroupId(value === 'none' ? null : value)} value={selectedGroupId || 'none'}><SelectTrigger id="installment-group"><SelectValue placeholder="Selecione um grupo (opcional)" /></SelectTrigger><SelectContent><SelectItem value="none">Nenhum grupo</SelectItem>{despesaGroups?.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent></Select>
                <Button type="button" variant="outline" size="icon" onClick={() => { setFormType('despesa'); setShowGroupsModal(true);}}><Settings className="h-4 w-4" /><span className="sr-only">Gerenciar Grupos</span></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="installment-total-value">Valor Total (R$)</Label>
                <Input id="installment-total-value" value={installmentTotalValue} onChange={handleInstallmentValueChange} placeholder="0,00" required className="mt-1" type="text" inputMode="decimal"/>
              </div>
              <div>
                <Label htmlFor="installment-count">Nº de Parcelas</Label>
                <Input id="installment-count" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value.replace(/\D/g, ''))} placeholder="Ex: 12" required className="mt-1" type="text" inputMode="numeric"/>
              </div>
            </div>
            <div>
              <Label htmlFor="installment-date">Data da 1ª Parcela</Label>
              <Popover><PopoverTrigger asChild><Button variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-1", !date && "text-muted-foreground")}><CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus locale={ptBR} /></PopoverContent></Popover>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={resetAndCloseInstallmentModal}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-sky-500 hover:bg-sky-600 text-white">{isSubmitting ? <Loader className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}Salvar Parcelamento</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showDescriptionsModal} onOpenChange={setShowDescriptionsModal}>
          <DialogContent>
              <DialogHeader><DialogTitle>Gerenciar Nomes de {formType === 'receita' ? 'Entrada' : 'Saída'}</DialogTitle><DialogDescription>Adicione ou remova nomes para seus lançamentos.</DialogDescription></DialogHeader>
              <form onSubmit={handleAddDescription} className="flex items-center space-x-2 py-4"><Input value={newDescriptionName} onChange={(e) => setNewDescriptionName(e.target.value)} placeholder="Nome do novo lançamento"/><Button type="submit" size="icon"><PlusCircle className="h-4 w-4" /></Button></form>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                  {descriptionsForForm && descriptionsForForm.length > 0 ? (descriptionsForForm.map(desc => (<div key={desc.id} className="flex items-center justify-between bg-secondary p-2 rounded-md"><span className="text-secondary-foreground">{desc.name}</span><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleDeleteDescription(desc.id)}><Trash2 className="h-4 w-4"/></Button></div>))) : <p className="text-center text-muted-foreground py-4">Nenhum nome cadastrado.</p>}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setShowDescriptionsModal(false)}>Fechar</Button></DialogFooter>
          </DialogContent>
      </Dialog>

      <Dialog open={showGroupsModal} onOpenChange={setShowGroupsModal}>
          <DialogContent>
              <DialogHeader><DialogTitle>Gerenciar Grupos de {formType === 'receita' ? 'Receita' : 'Despesa'}</DialogTitle><DialogDescription>Adicione ou remova grupos para categorizar suas transações.</DialogDescription></DialogHeader>
              <form onSubmit={handleAddGroup} className="flex items-center space-x-2 py-4"><Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Nome do novo grupo"/><Button type="submit" size="icon"><PlusCircle className="h-4 w-4" /></Button></form>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                  {groupsForForm && groupsForForm.length > 0 ? (groupsForForm.map(group => (<div key={group.id} className="flex items-center justify-between bg-secondary p-2 rounded-md"><span className="text-secondary-foreground">{group.name}</span><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleDeleteGroup(group.id)}><Trash2 className="h-4 w-4"/></Button></div>))) : <p className="text-center text-muted-foreground py-4">Nenhum grupo cadastrado.</p>}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => setShowGroupsModal(false)}>Fechar</Button></DialogFooter>
          </DialogContent>
      </Dialog>

      <Dialog open={showReportModal} onOpenChange={handleCloseReportModal}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>{renderReportHeader()}</DialogHeader>
            {reportView === 'summary' && <div className="space-y-4 py-4">
                    <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors" onClick={() => setReportView('all')}><span className="font-medium text-blue-700 dark:text-blue-300">Todos os Lançamentos</span><span className="font-bold text-lg text-blue-600 dark:text-blue-400">{transactions.length}</span></div>
                    <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors" onClick={() => setReportView('receitas')}><span className="font-medium text-emerald-700 dark:text-emerald-300">Total de Receitas</span><span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{formatCurrency(totalReceitas)}</span></div>
                    <div className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/30 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors" onClick={() => setReportView('despesas')}><span className="font-medium text-red-700 dark:text-red-300">Total de Despesas</span><span className="font-bold text-lg text-red-600 dark:text-red-400">{formatCurrency(totalDespesas)}</span></div>
                    <div className="flex justify-between items-center p-3 bg-sky-50 dark:bg-sky-900/30 rounded-lg cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors" onClick={() => setReportView('parcelas')}><span className="font-medium text-sky-700 dark:text-sky-300">Meus Parcelados</span><span className="font-bold text-lg text-sky-600 dark:text-sky-400">{installments.filter(i => i.status === 'pendente').length} pendentes</span></div>
                    <div className="flex justify-between items-center p-4 bg-card border-t-2 mt-4 rounded-lg"><span className="font-bold text-foreground">Saldo Final</span><span className={`font-extrabold text-xl ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(balance)}</span></div>
            </div>}
            {reportView === 'all' && renderGenericReport(filteredAllTransactions, 'transação')}
            {reportView === 'despesas' && renderGenericReport(filteredDespesas, 'despesa')}
            {reportView === 'receitas' && renderGenericReport(filteredReceitas, 'receita')}
            {reportView === 'parcelas' && renderInstallmentsReport()}
            <DialogFooter>{reportView !== 'summary' ? <Button onClick={() => setReportView('summary')} variant="outline">Voltar ao Resumo</Button> : <Button onClick={handleCloseReportModal} variant="outline">Fechar</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!transactionToDelete} onOpenChange={(isOpen) => !isOpen && setTransactionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Você tem certeza?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita. Isso excluirá permanentemente sua transação de nossos servidores.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel onClick={() => setTransactionToDelete(null)}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleDeleteTransaction}>Excluir</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!installmentToDelete} onOpenChange={(isOpen) => !isOpen && setInstallmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Compra Parcelada?</AlertDialogTitle>
            <AlertDialogDescription>
                Você tem certeza que deseja excluir esta compra parcelada? Todas as parcelas
                (<span className="font-semibold">{installmentToDelete?.totalParcelas}</span>) 
                relacionadas a <span className="font-semibold">"{installmentToDelete?.descricao.split(' (')[0]}"</span> serão removidas. 
                Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInstallmentToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInstallment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir Tudo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
