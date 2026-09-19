// 演示样本：覆盖字段缺失、null、异构数组、类型冲突
export const DEMO_SAMPLES = [
  {
    id: 1001,
    name: '张三',
    email: 'zhangsan@example.com',
    age: 28,
    role: 'admin',
    tags: ['vip', { level: 3 }, null, 42],
    address: { city: '上海', zip: '200000' },
    createdAt: '2026-09-01T08:30:00Z',
  },
  {
    id: 'usr-1002',
    name: '李四',
    email: 'lisi@example.com',
    role: 'member',
    tags: ['trial', { level: 1 }],
    address: null,
    createdAt: '2026-09-12T10:05:30Z',
  },
  {
    id: 1003,
    name: '王五',
    age: 35,
    role: 'admin',
    tags: ['vip', 'vip', null],
    createdAt: '2026-09-18T22:15:00Z',
  },
];
