
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, ArrowDown, CreditCard, Loader, Users, AlertTriangle, PieChart, ArrowLeft, Trash2, Search, X, CalendarIcon, MoreHorizontal, PlusCircle, Settings, LogOut } from 'lucide-react';
import type { Transaction, Group } from '@/lib/types';
import { useCollection, useFirebase, useMemoFirebase, useUser, addDocumentNonBlocking, deleteDocumentNonBlocking, signOutUser } from '@/firebase';
import { collection, query, doc, where } from 'firebase/firestore';
import { isToday, isThisMonth, isThisYear, isThisWeek, format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ThemeToggleButton } from '@/components/theme-toggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


export default function FinancyCanvas() {
  const { firestore, auth } = useFirebase();
  const { user, isUserLoading } = useUser();
  
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

  const { data: rawTransactions, isLoading: isLoadingTransactions, error: transactionsError } = useCollection<Transaction>(transactionsQuery);
  const { data: allGroups, isLoading: isLoadingGroups } = useCollection<Group>(groupsQuery);


  const [error, setError] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [reportView, setReportView] = useState<'summary' | 'despesas' | 'receitas'>('summary');
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [formType, setFormType] = useState<'despesa' | 'receita'>('despesa');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState('');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for report filtering
  const [reportPeriod, setReportPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('all');
  const [reportSearchTerm, setReportSearchTerm] = useState('');

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

  // Client-side sorting because orderBy is not in the query
  const transactions = useMemo(() => {
    if (!rawTransactions) return [];
    return [...rawTransactions].sort((a, b) => {
        const dateA = a.data?.toDate() || new Date(0);
        const dateB = b.data?.toDate() || new Date(0);
        return dateB.getTime() - dateA.getTime();
    });
  }, [rawTransactions]);

  const recentTransactions = useMemo(() => transactions.slice(0, 5), [transactions]);

  const { balance, totalReceitas, totalDespesas, despesas, receitas } = useMemo(() => {
    if (!transactions) {
      return { balance: 0, totalReceitas: 0, totalDespesas: 0, despesas: [], receitas: [] };
    }
    const receitasTransactions = transactions.filter(t => t.tipo === 'receita');
    const receitasTotal = receitasTransactions.reduce((acc, t) => acc + t.valor, 0);
    const despesasTransations = transactions.filter(t => t.tipo === 'despesa');
    const despesasTotal = despesasTransations.reduce((acc, t) => acc + t.valor, 0);
    const currentBalance = receitasTotal - despesasTotal;
    return { 
      balance: currentBalance, 
      totalReceitas: receitasTotal, 
      totalDespesas: despesasTotal, 
      despesas: despesasTransations,
      receitas: receitasTransactions
    };
  }, [transactions]);

  const chartData = useMemo(() => {
    if (!transactions) return [];

    const monthlyData: { [key: string]: { month: string; receita: number; despesa: number } } = {};

    transactions.forEach(t => {
        const transactionDate = t.data?.toDate();
        if (!transactionDate) return;

        const monthKey = format(transactionDate, 'yyyy-MM');
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = {
                month: format(transactionDate, 'MMM/yy', { locale: ptBR }),
                receita: 0,
                despesa: 0,
            };
        }

        if (t.tipo === 'receita') {
            monthlyData[monthKey].receita += t.valor;
        } else {
            monthlyData[monthKey].despesa += t.valor;
        }
    });

    return Object.values(monthlyData).sort((a, b) => {
        const dateA = parse(a.month, 'MMM/yy', new Date());
        const dateB = parse(b.month, 'MMM/yy', new Date());
        return dateA.getTime() - dateB.getTime();
    });
  }, [transactions]);

  const filterTransactionsByPeriod = useCallback((items: Transaction[], period: typeof reportPeriod, searchTerm: string) => {
    let filtered = items;

    if (searchTerm) {
        filtered = filtered.filter(d => d.descricao.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    if (period !== 'all') {
        filtered = filtered.filter(d => {
            const transactionDate = d.data?.toDate();
            if (!transactionDate) return false;
            
            switch (period) {
                case 'day': return isToday(transactionDate);
                case 'week': return isThisWeek(transactionDate, { weekStartsOn: 1 });
                case 'month': return isThisMonth(transactionDate);
                case 'year': return isThisYear(transactionDate);
                default: return true;
            }
        });
    }

    return filtered;
  }, []);

  const filteredDespesas = useMemo(() => {
    return filterTransactionsByPeriod(despesas, reportPeriod, reportSearchTerm);
  }, [despesas, reportPeriod, reportSearchTerm, filterTransactionsByPeriod]);

  const filteredTotalDespesas = useMemo(() => {
    return filteredDespesas.reduce((acc, d) => acc + d.valor, 0);
  }, [filteredDespesas]);

  const filteredReceitas = useMemo(() => {
    return filterTransactionsByPeriod(receitas, reportPeriod, reportSearchTerm);
  }, [receitas, reportPeriod, reportSearchTerm, filterTransactionsByPeriod]);

  const filteredTotalReceitas = useMemo(() => {
    return filteredReceitas.reduce((acc, d) => acc + d.valor, 0);
  }, [filteredReceitas]);

  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(amount);
  }, []);

  const formatCurrencySimple = useCallback((amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}k`;
    return amount.toString();
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

    if (description.trim() === '' || isNaN(numericValue) || numericValue <= 0 || !date) {
      setError("Por favor, preencha todos os campos com valores válidos.");
      setIsSubmitting(false);
      return;
    }

    const newTransaction: Omit<Transaction, 'id' | 'data'> & { data: Date; groupId?: string | null } = {
      userId: user.uid,
      descricao: description.trim(),
      valor: numericValue,
      tipo: formType,
      data: date,
    };
    
    if (selectedGroupId && selectedGroupId !== 'none') {
        newTransaction.groupId = selectedGroupId;
    }

    const userTransactionsCollection = collection(firestore, 'users', user.uid, 'transactions');
    addDocumentNonBlocking(userTransactionsCollection, newTransaction);

    setDescription('');
    setValue('');
    setDate(new Date());
    setSelectedGroupId(null);
    setShowModal(false);
    setError('');
    setIsSubmitting(false);
  };

  const handleDeleteTransaction = () => {
    if (!user || !firestore || !transactionToDelete) return;

    const transactionRef = doc(firestore, 'users', user.uid, 'transactions', transactionToDelete);
    deleteDocumentNonBlocking(transactionRef);
    setTransactionToDelete(null);
  };

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !firestore || newGroupName.trim() === '') return;

    const newGroup = {
        userId: user.uid,
        name: newGroupName.trim(),
        tipo: formType,
    };
    const userGroupsCollection = collection(firestore, 'users', user.uid, 'groups');
    addDocumentNonBlocking(userGroupsCollection, newGroup);
    setNewGroupName('');
  };

  const handleDeleteGroup = (groupId: string) => {
      if (!user || !firestore) return;
      const groupRef = doc(firestore, 'users', user.uid, 'groups', groupId);
      deleteDocumentNonBlocking(groupRef);
  };


  const openModal = (type: 'receita' | 'despesa') => {
    setFormType(type);
    setShowModal(true);
  }

  const isLoading = isUserLoading || isLoadingTransactions || isLoadingGroups || !user;
  
  const handleCloseReportModal = () => {
    setShowReportModal(false);
    // Use a timeout to reset views after the modal closes
    setTimeout(() => {
        setReportView('summary');
        setReportPeriod('all');
        setReportSearchTerm('');
    }, 300);
  };
  
  const handleLogout = () => {
    if (auth) {
        signOutUser(auth);
    }
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
  const modalTitle = formType === 'receita' ? 'Adicionar Receita' : 'Adicionar Despesa';
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
    const title = reportView === 'despesas' ? "Relatório de Despesas" : "Relatório de Receitas";
    const color = reportView === 'despesas' ? "text-red-500" : "text-emerald-500";
    return (
        <div className="flex items-center">
            <Button variant="ghost" size="icon" className="mr-2" onClick={() => setReportView('summary')}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            <DialogTitle className={`text-2xl font-bold ${color}`}>{title}</DialogTitle>
        </div>
    );
  };

  const renderDetailedReport = (type: 'receitas' | 'despesas') => {
      const items = type === 'receitas' ? filteredReceitas : filteredDespesas;
      const total = type === 'receitas' ? filteredTotalReceitas : filteredTotalDespesas;
      const baseColor = type === 'receitas' ? 'emerald' : 'red';
      

      return (
        <div className="py-4 pr-2">
            <div className="flex flex-col space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                        placeholder="Filtrar por descrição..."
                        value={reportSearchTerm}
                        onChange={(e) => setReportSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                      {reportSearchTerm && <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setReportSearchTerm('')}><X className="h-4 w-4"/></Button>}
                </div>
                <Tabs defaultValue="all" onValueChange={(value) => setReportPeriod(value as any)}>
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="all">Total</TabsTrigger>
                        <TabsTrigger value="day">Dia</TabsTrigger>
                        <TabsTrigger value="week">Semana</TabsTrigger>
                        <TabsTrigger value="month">Mês</TabsTrigger>
                        <TabsTrigger value="year">Ano</TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className={`flex justify-between items-center p-3 bg-${baseColor}-50 dark:bg-${baseColor}-900/30 rounded-lg`}>
                    <span className={`font-medium text-${baseColor}-700 dark:text-${baseColor}-300`}>Total Filtrado</span>
                    <span className={`font-bold text-lg text-${baseColor}-600 dark:text-${baseColor}-400`}>{formatCurrency(total)}</span>
                </div>

                <div className="max-h-[40vh] overflow-y-auto pr-2">
                  {items.length > 0 ? (
                    <ul className="space-y-3">
                        {items.map(d => (
                            <li key={d.id} className={`flex justify-between items-start p-3 bg-card border-l-4 border-${baseColor}-400 rounded-lg`}>
                                <div>
                                    <p className={`font-medium text-sm text-foreground`}>{d.descricao}</p>
                                    {d.groupId && groupMap.get(d.groupId) && (
                                        <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full mt-1 inline-block">
                                            {groupMap.get(d.groupId)}
                                        </span>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {d.data?.toDate().toLocaleString('pt-BR', {
                                            day: '2-digit', month: '2-digit', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                                <p className={`font-semibold text-${baseColor}-600 dark:text-${baseColor}-400 whitespace-nowrap ml-4`}>{formatCurrency(d.valor)}</p>
                            </li>
                        ))}
                    </ul>
                  ) : (
                    <div className="text-center py-10 text-muted-foreground">
                      <p>Nenhuma {type === 'receitas' ? 'receita' : 'despesa'} encontrada para os filtros selecionados.</p>
                    </div>
                  )}
                </div>
            </div>
        </div>
    );
  };
  
  const chartConfig = {
    receita: {
      label: "Receita",
      color: "hsl(var(--chart-2))",
    },
    despesa: {
      label: "Despesa",
      color: "hsl(var(--chart-1))",
    },
  };
  
  const groupsForForm = formType === 'receita' ? receitaGroups : despesaGroups;

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8 font-body">
      <div className="max-w-4xl mx-auto">
        {pageError && !showModal && (
            <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Ops! Ocorreu um Erro</AlertTitle>
                <AlertDescription className="font-mono text-xs">{typeof pageError === 'string' ? pageError : pageError.message}</AlertDescription>
            </Alert>
        )}
        <header className="mb-8 p-4 sm:p-6 bg-card rounded-2xl shadow-lg border-t-4 border-primary">
          <div className="flex justify-between items-start sm:items-center mb-4 flex-col sm:flex-row">
            <h1 className="text-2xl font-extrabold text-foreground flex items-center mb-2 sm:mb-0">
              <CreditCard className="w-6 h-6 mr-2 text-primary" />
              Minhas Finanças
            </h1>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-muted-foreground flex items-center" title={user?.email || user?.uid}>
                <Users className="w-3 h-3 mr-1" />
                {user?.email || user?.uid.substring(0,10)}
              </span>
              <ThemeToggleButton />
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
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
            className="w-full p-6 bg-red-500 hover:bg-red-500 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"
          >
            <ArrowDown className="w-5 h-5 mr-2" />
            Saídas
          </Button>
          <Button
            onClick={() => setShowReportModal(true)}
            className="w-full p-6 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl shadow-lg transition transform hover:scale-105"
          >
            <PieChart className="w-5 h-5 mr-2" />
            Relatório
          </Button>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between">
              <div>
                  <CardTitle>Visão Geral Mensal</CardTitle>
                  <CardDescription>Receitas e despesas ao longo dos meses.</CardDescription>
              </div>
               <Button variant="ghost" size="sm" onClick={() => { setReportView('summary'); setShowReportModal(true); }}>
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Ver relatório completo</span>
              </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {transactions.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <PieChart className="w-10 h-10 mx-auto mb-3" />
                <p>Nenhum dado para exibir no gráfico.</p>
                <p className='text-sm mt-1'>Adicione transações para começar a visualizar.</p>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false}/>
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrencySimple(value as number)} />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--accent))', radius: 'var(--radius)' }}
                      content={<ChartTooltipContent formatter={(value, name) => <div><p className="font-medium">{name === 'receita' ? 'Receitas' : 'Despesas'}</p><p>{formatCurrency(value as number)}</p></div>} />}
                    />
                    <Legend />
                    <Bar dataKey="receita" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} name="Receitas"/>
                    <Bar dataKey="despesa" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Despesas"/>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}

            <div>
              <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Transações Recentes</h3>
                   <Button variant="link" size="sm" className="text-primary" onClick={() => { setReportView('summary'); setShowReportModal(true); }}>Ver Todas</Button>
              </div>
              {recentTransactions.length > 0 ? (
                  <ul className="space-y-3">
                    {recentTransactions.map((t) => (
                      <li
                        key={t.id}
                        className={`group flex justify-between items-center p-3 rounded-lg border-l-4 transition-all duration-200 
                          ${t.tipo === 'receita' ? 'border-emerald-400 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30 dark:border-emerald-700' : 'border-red-400 bg-red-50/50 hover:bg-red-50 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:border-red-700'}`}
                      >
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 ${t.tipo === 'receita' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-800/30 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-800/30 dark:text-red-400'}`}>
                             {t.tipo === 'receita' ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                          </div>
                          <div>
                            <p className="font-medium text-foreground leading-tight text-sm">{t.descricao}</p>
                            {t.groupId && groupMap.get(t.groupId) && (
                                <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full mt-1 inline-block">
                                    {groupMap.get(t.groupId)}
                                </span>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t.data && t.data.toDate().toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center flex-shrink-0 ml-4">
                          <p className={`font-semibold text-sm ${t.tipo === 'receita' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {t.tipo === 'receita' ? '+' : '-'} {formatCurrency(t.valor)}
                          </p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 ml-2 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setTransactionToDelete(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
              ) : (
                <div className="py-6 text-center text-muted-foreground">
                  <p>Nenhuma transação registrada ainda.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showModal} onOpenChange={(isOpen) => { if (!isOpen) { setError(''); setSelectedGroupId(null); } setShowModal(isOpen); }}>
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
              <Label htmlFor="description" className="text-left">Nome da {formType === 'receita' ? 'Entrada' : 'Saída'}</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={formType === 'receita' ? "Ex: Salário" : "Ex: Aluguel"}
                required
                className="mt-1"
              />
            </div>
            
            <div>
              <Label htmlFor="group">Grupo</Label>
              <div className="flex items-center space-x-2 mt-1">
                <Select onValueChange={(value) => setSelectedGroupId(value === 'none' ? null : value)} value={selectedGroupId || 'none'}>
                    <SelectTrigger id="group">
                        <SelectValue placeholder="Selecione um grupo (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Nenhum grupo</SelectItem>
                        {groupsForForm?.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                                {group.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => setShowGroupsModal(true)}>
                    <Settings className="h-4 w-4" />
                    <span className="sr-only">Gerenciar Grupos</span>
                </Button>
              </div>
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
            <div>
                <Label htmlFor="date" className="text-left">Data</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn(
                                "w-full justify-start text-left font-normal mt-1",
                                !date && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP", { locale: ptBR }) : <span>Escolha uma data</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            initialFocus
                            locale={ptBR}
                        />
                    </PopoverContent>
                </Popover>
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

      <Dialog open={showGroupsModal} onOpenChange={setShowGroupsModal}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Gerenciar Grupos de {formType === 'receita' ? 'Receita' : 'Despesa'}</DialogTitle>
                  <DialogDescription>Adicione ou remova grupos para categorizar suas transações.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddGroup} className="flex items-center space-x-2 py-4">
                  <Input 
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Nome do novo grupo"
                  />
                  <Button type="submit" size="icon">
                      <PlusCircle className="h-4 w-4" />
                  </Button>
              </form>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                  {groupsForForm && groupsForForm.length > 0 ? (
                      groupsForForm.map(group => (
                          <div key={group.id} className="flex items-center justify-between bg-secondary p-2 rounded-md">
                              <span className="text-secondary-foreground">{group.name}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleDeleteGroup(group.id)}>
                                  <Trash2 className="h-4 w-4"/>
                              </Button>
                          </div>
                      ))
                  ) : (
                      <p className="text-center text-muted-foreground py-4">Nenhum grupo cadastrado.</p>
                  )}
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setShowGroupsModal(false)}>Fechar</Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>


      <Dialog open={showReportModal} onOpenChange={handleCloseReportModal}>
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                {renderReportHeader()}
            </DialogHeader>

            {reportView === 'summary' && (
                <div className="space-y-4 py-4">
                    <div 
                        className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-lg cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
                        onClick={() => setReportView('receitas')}
                    >
                        <span className="font-medium text-emerald-700 dark:text-emerald-300">Total de Receitas</span>
                        <span className="font-bold text-lg text-emerald-600 dark:text-emerald-400">{formatCurrency(totalReceitas)}</span>
                    </div>
                    <div 
                        className="flex justify-between items-center p-3 bg-red-50 dark:bg-red-900/30 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                        onClick={() => setReportView('despesas')}
                    >
                        <span className="font-medium text-red-700 dark:text-red-300">Total de Despesas</span>
                        <span className="font-bold text-lg text-red-600 dark:text-red-400">{formatCurrency(totalDespesas)}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-card border-t-2 mt-4 rounded-lg">
                        <span className="font-bold text-foreground">Saldo Final</span>
                        <span className={`font-extrabold text-xl ${balance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(balance)}</span>
                    </div>
                </div>
            )}
            
            {reportView === 'despesas' && renderDetailedReport('despesas')}
            {reportView === 'receitas' && renderDetailedReport('receitas')}
            
            <DialogFooter>
                {reportView !== 'summary' ? (
                    <Button onClick={() => setReportView('summary')} variant="outline">Voltar ao Resumo</Button>
                ) : (
                    <Button onClick={handleCloseReportModal} variant="outline">Fechar</Button>
                )}
            </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <AlertDialog open={!!transactionToDelete} onOpenChange={(isOpen) => !isOpen && setTransactionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso excluirá permanentemente sua transação de nossos servidores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTransactionToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTransaction}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
