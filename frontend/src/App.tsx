import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <Dashboard />
      </Layout>
    </QueryClientProvider>
  );
}
