'use strict';

const HEALTH_CHECK_QUERIES = [
  {
    id: 'A0',
    name: 'Thông tin server & database',
    section: 'A',
    target: 'general',
    description: 'Thông tin cơ bản về SQL Server, phiên bản, uptime và trạng thái database',
    resultType: 'single_row',
    sql: `SELECT @@SERVERNAME AS server_name, DB_NAME() AS current_database,
SERVERPROPERTY('ProductVersion') AS sql_version, SERVERPROPERTY('Edition') AS edition,
GETDATE() AS check_time,
(SELECT sqlserver_start_time FROM sys.dm_os_sys_info) AS server_start_time,
DATEDIFF(HOUR,(SELECT sqlserver_start_time FROM sys.dm_os_sys_info),GETDATE()) AS uptime_hours,
(SELECT state_desc FROM sys.databases WHERE name=DB_NAME()) AS db_state,
(SELECT recovery_model_desc FROM sys.databases WHERE name=DB_NAME()) AS recovery_model`,
  },
  {
    id: 'A1',
    name: 'CPU hiện tại',
    section: 'A',
    target: 'general',
    description: 'Đo % CPU SQL Server đang dùng so với tổng CPU máy chủ',
    resultType: 'single_row',
    sql: `SELECT TOP 1
record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]','int') AS sql_server_cpu_percent,
record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]','int') AS system_idle_percent,
DATEADD(ms,-1*(si.cpu_ticks/(si.cpu_ticks/si.ms_ticks)-rb.timestamp),GETDATE()) AS sample_time
FROM (SELECT timestamp,CONVERT(xml,record) AS record FROM sys.dm_os_ring_buffers
WHERE ring_buffer_type='RING_BUFFER_SCHEDULER_MONITOR' AND record LIKE '%ProcessUtilization%') rb
CROSS JOIN sys.dm_os_sys_info si ORDER BY rb.timestamp DESC`,
  },
  {
    id: 'A2',
    name: 'Memory PLE',
    section: 'A',
    target: 'general',
    description: 'Page Life Expectancy - số giây trung bình một trang dữ liệu tồn tại trong bộ nhớ',
    resultType: 'single_row',
    sql: `SELECT cntr_value AS page_life_expectancy_seconds,
CAST(cntr_value/60.0 AS DECIMAL(10,1)) AS ple_in_minutes
FROM sys.dm_os_performance_counters
WHERE counter_name='Page life expectancy' AND object_name LIKE '%Buffer Manager%'`,
  },
  {
    id: 'A2b',
    name: 'Memory usage',
    section: 'A',
    target: 'general',
    description: 'Dung lượng RAM SQL Server đang dùng và phần trăm so với quota',
    resultType: 'single_row',
    sql: `SELECT physical_memory_in_use_kb/1024 AS sql_memory_used_mb,
memory_utilization_percentage AS memory_used_percent_of_quota
FROM sys.dm_os_process_memory`,
  },
  {
    id: 'A3',
    name: 'Database files',
    section: 'A',
    target: 'general',
    description: 'Thông tin dung lượng, mức sử dụng và cài đặt autogrowth cho từng file database',
    resultType: 'multi_row',
    sql: `SELECT mf.name AS logical_file_name, mf.type_desc AS file_type,
CAST(mf.size*8.0/1048576 AS DECIMAL(10,2)) AS size_gb,
CAST(FILEPROPERTY(mf.name,'SpaceUsed')*8.0/1048576 AS DECIMAL(10,2)) AS used_gb,
CAST((mf.size-FILEPROPERTY(mf.name,'SpaceUsed'))*8.0/1048576 AS DECIMAL(10,2)) AS free_gb,
CAST(FILEPROPERTY(mf.name,'SpaceUsed')*100.0/NULLIF(mf.size,0) AS DECIMAL(5,1)) AS used_percent,
CASE mf.is_percent_growth WHEN 1 THEN CAST(mf.growth AS VARCHAR)+'%'
ELSE CAST(CAST(mf.growth*8.0/1024 AS DECIMAL(8,0)) AS VARCHAR)+' MB' END AS autogrowth_setting
FROM sys.database_files mf ORDER BY mf.type_desc,mf.size DESC`,
  },
  {
    id: 'A3b',
    name: 'Volume stats',
    section: 'A',
    target: 'general',
    description: 'Thống kê dung lượng ổ đĩa chứa database (tổng, còn trống, % đã dùng)',
    resultType: 'multi_row',
    sql: `SELECT volume_mount_point,
CAST(total_bytes/1073741824.0 AS DECIMAL(10,2)) AS total_gb,
CAST(available_bytes/1073741824.0 AS DECIMAL(10,2)) AS free_gb,
CAST((1.0-CAST(available_bytes AS FLOAT)/total_bytes)*100 AS DECIMAL(5,2)) AS used_percent
FROM sys.dm_os_volume_stats(DB_ID(),1)`,
  },
  {
    id: 'A4',
    name: 'Wait stats',
    section: 'A',
    target: 'general',
    description: 'Top 10 loại wait event SQL Server đang chờ nhiều nhất (loại trừ các wait system nội bộ)',
    resultType: 'multi_row',
    sql: `SELECT TOP 10 wait_type, waiting_tasks_count, wait_time_ms, max_wait_time_ms,
CAST(wait_time_ms*100.0/NULLIF(SUM(wait_time_ms) OVER(),0) AS DECIMAL(5,2)) AS percent_of_total_wait
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN ('SLEEP_TASK','BROKER_TO_FLUSH','BROKER_TASK_STOP','CLR_AUTO_EVENT',
'LAZYWRITER_SLEEP','SQLTRACE_BUFFER_FLUSH','XE_TIMER_EVENT','XE_DISPATCHER_WAIT',
'REQUEST_FOR_DEADLOCK_SEARCH','CHECKPOINT_QUEUE','DIRTY_PAGE_POLL',
'SQLTRACE_INCREMENTAL_FLUSH_SLEEP','WAITFOR','BROKER_EVENTHANDLER')
AND wait_time_ms>0 ORDER BY wait_time_ms DESC`,
  },
  {
    id: 'A5',
    name: 'Active sessions',
    section: 'A',
    target: 'general',
    description: 'Các session đang chạy query (không tính session hiện tại và background). Kết quả rỗng = tốt',
    resultType: 'empty_is_ok',
    sql: `SELECT r.session_id, r.status, r.command, r.wait_type,
r.wait_time/1000 AS wait_seconds, r.total_elapsed_time/1000 AS running_seconds,
r.blocking_session_id, r.cpu_time, r.logical_reads,
DB_NAME(r.database_id) AS database_name, s.login_name, s.host_name,
LEFT(s.program_name,40) AS program_name, LEFT(qt.text,150) AS current_sql_text
FROM sys.dm_exec_requests r JOIN sys.dm_exec_sessions s ON r.session_id=s.session_id
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) qt
WHERE r.session_id<>@@SPID AND r.status<>'background'
ORDER BY r.total_elapsed_time DESC`,
  },
  {
    id: 'A6',
    name: 'Blocking chain',
    section: 'A',
    target: 'general',
    description: 'Các session đang bị block bởi session khác. Kết quả rỗng = không có blocking = tốt',
    resultType: 'empty_is_ok',
    sql: `SELECT blocked.session_id AS bi_chan_session_id,
blocked.blocking_session_id AS thu_pham_session_id, blocked.wait_type,
blocked.wait_time/1000 AS da_cho_bao_lau_giay,
DB_NAME(blocked.database_id) AS database_name,
LEFT(qt.text,150) AS bi_chan_dang_chay_lenh_gi
FROM sys.dm_exec_requests blocked
CROSS APPLY sys.dm_exec_sql_text(blocked.sql_handle) qt
WHERE blocked.blocking_session_id>0`,
  },
  {
    id: 'A7',
    name: 'SQL Agent Jobs',
    section: 'A',
    target: 'general',
    description: 'Lịch sử chạy của các SQL Agent Job trong 20 giờ gần nhất',
    resultType: 'multi_row',
    sql: `SELECT job.name AS job_name, job.enabled,
CASE h.run_status WHEN 0 THEN 'Failed' WHEN 1 THEN 'Succeeded'
WHEN 2 THEN 'Retry' WHEN 3 THEN 'Cancelled' WHEN 4 THEN 'Running' END AS last_run_status,
msdb.dbo.agent_datetime(h.run_date,h.run_time) AS last_run_datetime,
h.run_duration AS duration_hhmmss, LEFT(h.message,150) AS message
FROM msdb.dbo.sysjobs job
JOIN msdb.dbo.sysjobhistory h ON job.job_id=h.job_id AND h.step_id=0
WHERE msdb.dbo.agent_datetime(h.run_date,h.run_time)>=DATEADD(HOUR,-20,GETDATE())
ORDER BY last_run_datetime DESC`,
  },
  {
    id: 'A8',
    name: 'TempDB',
    section: 'A',
    target: 'general',
    description: 'Dung lượng và mức sử dụng các file TempDB',
    resultType: 'multi_row',
    sql: `SELECT name AS file_name, CAST(size*8.0/1024 AS DECIMAL(10,2)) AS size_mb,
CAST(FILEPROPERTY(name,'SpaceUsed')*8.0/1024 AS DECIMAL(10,2)) AS used_mb, physical_name
FROM tempdb.sys.database_files`,
  },
  {
    id: 'B1',
    name: 'Memory config',
    section: 'B',
    target: 'crm',
    description: 'Cấu hình bộ nhớ và parallelism của SQL Server (max/min memory, MAXDOP, cost threshold)',
    resultType: 'multi_row',
    sql: `SELECT name, CAST(value_in_use AS INT) AS value_in_use, description
FROM sys.configurations
WHERE name IN ('max server memory (MB)','min server memory (MB)',
'cost threshold for parallelism','max degree of parallelism')
ORDER BY name`,
  },
  {
    id: 'B2',
    name: 'CRM file by filegroup',
    section: 'B',
    target: 'crm',
    description: 'Dung lượng và mức sử dụng từng file data theo filegroup trong CRM database',
    resultType: 'multi_row',
    sql: `SELECT mf.name AS logical_name, fg.name AS filegroup_name,
CAST(mf.size*8.0/1048576 AS DECIMAL(10,2)) AS size_gb,
CAST(FILEPROPERTY(mf.name,'SpaceUsed')*8.0/1048576 AS DECIMAL(10,2)) AS used_gb,
CAST((mf.size-FILEPROPERTY(mf.name,'SpaceUsed'))*8.0/1048576 AS DECIMAL(10,2)) AS free_gb,
CAST(FILEPROPERTY(mf.name,'SpaceUsed')*100.0/NULLIF(mf.size,0) AS DECIMAL(5,1)) AS used_percent
FROM sys.database_files mf LEFT JOIN sys.filegroups fg ON mf.data_space_id=fg.data_space_id
WHERE mf.type_desc='ROWS' ORDER BY mf.size DESC`,
  },
  {
    id: 'B3',
    name: 'Top tables',
    section: 'B',
    target: 'crm',
    description: 'Top 10 bảng lớn nhất trong CRM database (theo dung lượng)',
    resultType: 'multi_row',
    sql: `SELECT TOP 10 t.name AS table_name, p.rows AS row_count,
CAST(SUM(a.total_pages)*8.0/1048576 AS DECIMAL(10,2)) AS total_gb,
CAST(SUM(a.used_pages)*8.0/1048576 AS DECIMAL(10,2)) AS used_gb
FROM sys.tables t JOIN sys.indexes i ON t.object_id=i.object_id
JOIN sys.partitions p ON i.object_id=p.object_id AND i.index_id=p.index_id
JOIN sys.allocation_units a ON p.partition_id=a.container_id
WHERE i.index_id IN (0,1) GROUP BY t.name,p.rows ORDER BY SUM(a.total_pages) DESC`,
  },
  {
    id: 'B4',
    name: 'Zero read indexes',
    section: 'B',
    target: 'crm',
    description: 'Index được ghi nhiều nhưng chưa từng được đọc kể từ lần SQL Server restart gần nhất',
    resultType: 'multi_row',
    sql: `SELECT OBJECT_NAME(s.object_id) AS table_name, i.name AS index_name,
s.user_seeks+s.user_scans+s.user_lookups AS total_reads,
s.user_updates AS total_writes, s.last_user_update
FROM sys.dm_db_index_usage_stats s
JOIN sys.indexes i ON s.object_id=i.object_id AND s.index_id=i.index_id
WHERE s.database_id=DB_ID() AND i.index_id>1
AND (s.user_seeks+s.user_scans+s.user_lookups)=0
AND s.user_updates>1000 ORDER BY s.user_updates DESC`,
  },
  {
    id: 'B5',
    name: 'Coupon perf',
    section: 'B',
    target: 'crm',
    description: 'Hiệu năng các query liên quan đến coupon/thẻ trong 20 giờ gần nhất',
    resultType: 'multi_row',
    sql: `SELECT TOP 15 qs.execution_count,
qs.total_elapsed_time/qs.execution_count/1000 AS avg_elapsed_ms,
qs.max_elapsed_time/1000 AS max_elapsed_ms,
qs.total_physical_reads/qs.execution_count AS avg_physical_reads,
qs.total_logical_reads/qs.execution_count AS avg_logical_reads,
qs.last_execution_time, LEFT(qt.text,100) AS query_text
FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
WHERE qt.dbid=DB_ID()
AND (qt.text LIKE '%CARD_COUPONS%' OR qt.text LIKE '%CouponType%' OR qt.text LIKE '%COUPON_CODE%')
AND qs.last_execution_time>=DATEADD(HOUR,-20,GETDATE())
ORDER BY qs.execution_count DESC`,
  },
  {
    id: 'B6',
    name: 'Transaction insert perf',
    section: 'B',
    target: 'crm',
    description: 'Hiệu năng các query INSERT vào bảng CARD_TRANSACTIONS_BI trong 20 giờ gần nhất',
    resultType: 'multi_row',
    sql: `SELECT TOP 10 qs.execution_count,
qs.total_elapsed_time/qs.execution_count/1000 AS avg_elapsed_ms,
qs.max_elapsed_time/1000 AS max_elapsed_ms,
qs.total_physical_reads/qs.execution_count AS avg_physical_reads,
qs.last_execution_time
FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
WHERE qt.dbid=DB_ID() AND qt.text LIKE '%CARD_TRANSACTIONS_BI%'
AND qs.last_execution_time>=DATEADD(HOUR,-20,GETDATE())`,
  },
  {
    id: 'B7',
    name: 'Connections',
    section: 'B',
    target: 'crm',
    description: 'Thống kê số lượng kết nối theo host và application, phân loại đang chạy/đang nghỉ',
    resultType: 'multi_row',
    sql: `SELECT host_name, LEFT(program_name,40) AS program_name, COUNT(*) AS so_luong_ket_noi,
SUM(CASE WHEN status='sleeping' THEN 1 ELSE 0 END) AS dang_nghi,
SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS dang_chay,
MAX(total_elapsed_time)/1000 AS ket_noi_lau_nhat_giay,
SUM(open_transaction_count) AS tong_open_transaction
FROM sys.dm_exec_sessions
WHERE is_user_process=1 AND session_id<>@@SPID
GROUP BY host_name,LEFT(program_name,40) ORDER BY so_luong_ket_noi DESC`,
  },
  {
    id: 'B8',
    name: 'Missing indexes',
    section: 'B',
    target: 'crm',
    description: 'Top 5 index bị thiếu có mức độ ảnh hưởng lớn nhất theo đánh giá của SQL Server optimizer',
    resultType: 'multi_row',
    sql: `SELECT TOP 5
migs.avg_total_user_cost*migs.avg_user_impact*(migs.user_seeks+migs.user_scans) AS muc_do_anh_huong,
mid.statement AS bang_lien_quan, mid.equality_columns, mid.inequality_columns,
mid.included_columns, migs.user_seeks,
CAST(migs.avg_user_impact AS DECIMAL(5,1)) AS phan_tram_cai_thien_uoc_tinh
FROM sys.dm_db_missing_index_groups mig
JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle=migs.group_handle
JOIN sys.dm_db_missing_index_details mid ON mig.index_handle=mid.index_handle
WHERE mid.database_id=DB_ID() ORDER BY muc_do_anh_huong DESC`,
  },
  {
    id: 'B9',
    name: 'Audit DELETE',
    section: 'B',
    target: 'crm',
    description: 'Lịch sử các lệnh DELETE được ghi audit trong 20 giờ gần nhất',
    resultType: 'multi_row',
    sql: `SELECT TOP 50 event_time, action_id, object_name,
server_principal_name AS sql_login, client_ip, application_name, host_name,
LEFT(statement,150) AS cau_lenh
FROM sys.fn_get_audit_file('D:\\Logs\\Audit\\CRM_Audit*.sqlaudit',DEFAULT,DEFAULT)
WHERE action_id='DL' AND database_name=DB_NAME()
AND event_time>=DATEADD(HOUR,-20,GETDATE())
ORDER BY event_time DESC`,
  },
];

module.exports = { HEALTH_CHECK_QUERIES };
