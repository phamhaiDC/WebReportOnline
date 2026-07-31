-- dbo.fn_CouponUsageBySuffix — R_KEEPER_7_CRM_VTI
-- Dùng bởi backend/routes/ecodeCouponCheck.js (SELECT * FROM dbo.fn_CouponUsageBySuffix(@ecode))
--
-- Cột COUPON_TYPE_NAME / DATE_FROM / DATE_TO đã tồn tại sẵn trên DB (được thêm ở lần sửa trước)
-- nhưng nằm sai vị trí so với thứ tự mong muốn. Script này chỉ sắp xếp lại thứ tự cột:
--   STORE, COUPON_TYPE_NAME, STORENAME, NGAY_SU_DUNG, SO_CHECK, MA_CODE,
--   COUPON_ID, COUPON_CODE, DATE_FROM, DATE_TO, FLAGS, GHI_CHU
-- DATE_FROM/DATE_TO được format NVARCHAR theo cùng kiểu (CONVERT style 120) đang dùng cho
-- NGAY_SU_DUNG, thay vì trả DATETIME thô.

ALTER FUNCTION [dbo].[fn_CouponUsageBySuffix] (@suffix VARCHAR(13))
RETURNS @result TABLE (
    STORE             INT,
    COUPON_TYPE_NAME  NVARCHAR(200),
    STORENAME         NVARCHAR(100),
    NGAY_SU_DUNG      NVARCHAR(100),
    SO_CHECK          INT,
    MA_CODE           NVARCHAR(50),
    COUPON_ID         BIGINT,
    COUPON_CODE       VARCHAR(13),
    DATE_FROM         NVARCHAR(30),
    DATE_TO           NVARCHAR(30),
    FLAGS             INT,
    GHI_CHU           NVARCHAR(200)
)
AS
BEGIN
    -- 1) Validate input
    IF @suffix IS NULL OR @suffix LIKE '%[^0-9]%' OR LEN(@suffix) NOT BETWEEN 1 AND 13
    BEGIN
        INSERT @result (STORE, NGAY_SU_DUNG, GHI_CHU)
        VALUES (0, N'Độ dài không đủ', N'Input phải là 1–13 chữ số');
        RETURN;
    END

    DECLARE @klen INT = 13 - LEN(@suffix);

    IF @klen > 4     -- thiếu >4 số → 10^5+ tổ hợp, không đáng
    BEGIN
        INSERT @result (STORE, NGAY_SU_DUNG, GHI_CHU)
        VALUES (0, N'Độ dài không đủ',
                N'Thiếu ' + CAST(@klen AS VARCHAR) + N' số đầu - fragment quá ngắn');
        RETURN;
    END

    -- 2) Sinh code bằng bảng chữ số hằng (rẻ), đổ vào table variable để ép loop seek
    DECLARE @maxCombos INT = CAST(POWER(10, @klen) AS INT);   -- klen 0..4 → 1..10000
    DECLARE @codes TABLE (full_code VARCHAR(13) PRIMARY KEY);

    INSERT @codes (full_code)
    SELECT RIGHT(REPLICATE('0', @klen) + CAST(g.n AS VARCHAR(13)), @klen) + @suffix
    FROM (
        SELECT d1.n*1000 + d2.n*100 + d3.n*10 + d4.n AS n
        FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) d1(n)
        CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) d2(n)
        CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) d3(n)
        CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) d4(n)
    ) g
    WHERE g.n < @maxCombos;

    -- 3) Tìm coupon khớp (loop seek, code cũ) + lấy thêm tên loại coupon và ngày hiệu lực
    DECLARE @matches TABLE (
        COUPON_ID    BIGINT,
        COUPON_CODE  VARCHAR(13),
        FLAGS        INT,
        TYPE_NAME    NVARCHAR(200),
        DATE_FROM    DATETIME,
        DATE_TO      DATETIME
    );
    INSERT @matches (COUPON_ID, COUPON_CODE, FLAGS, TYPE_NAME, DATE_FROM, DATE_TO)
    SELECT cp.COUPON_ID, cp.COUPON_CODE, cp.FLAGS, ct.NAME, cp.DATE_FROM, cp.DATE_TO
    FROM @codes k
    JOIN dbo.CARD_COUPONS cp ON cp.COUPON_CODE = k.full_code
    LEFT JOIN dbo.CARD_COUPON_TYPES ct ON ct.COUPON_TYPE_ID = cp.COUPON_TYPE_ID;

    -- 4) Không có coupon nào khớp
    IF NOT EXISTS (SELECT 1 FROM @matches)
    BEGIN
        INSERT @result (STORE, NGAY_SU_DUNG, GHI_CHU)
        VALUES (0, N'Không tìm thấy', N'Không có coupon nào khớp đuôi ' + @suffix);
        RETURN;
    END

    -- 5a) Coupon CÓ giao dịch → usage
    INSERT @result (STORE, COUPON_TYPE_NAME, STORENAME, NGAY_SU_DUNG, SO_CHECK, MA_CODE, COUPON_ID, COUPON_CODE, DATE_FROM, DATE_TO, FLAGS, GHI_CHU)
    SELECT
        ctn.XML_CHECK.value('(/CHECK/@restaurantcode)[1]','int'),
        m.TYPE_NAME,
        R.NAME,
        CONVERT(NVARCHAR(30), ctn.XML_CHECK.value('(/CHECK/@generateddatetime)[1]','datetime'), 120),
        ctn.XML_CHECK.value('(/CHECK/CHECKDATA/@checknum)[1]','int'),
        ctn.XML_CHECK.value('(/CHECK/EXTINFO/INTERFACES/INTERFACE/HOLDERS/ITEM/@cardcode)[1]','nvarchar(50)'),
        m.COUPON_ID, m.COUPON_CODE,
        CONVERT(NVARCHAR(30), m.DATE_FROM, 120),
        CONVERT(NVARCHAR(30), m.DATE_TO, 120),
        m.FLAGS,
        CASE WHEN (m.FLAGS & 2) = 2 THEN N'Đã sử dụng' ELSE N'Chưa sử dụng' END
    FROM @matches m
    JOIN CARD_TRANSACTIONS ct            ON ct.ACCOUNT_ID = m.COUPON_ID
    LEFT JOIN CARD_TRANSACTION_NOTES ctn ON ctn.TRANSACTION_ID = ct.TRANSACTION_ID
    LEFT JOIN [10.251.14.5].RK7_VTI.dbo.RESTAURANTS R ON R.CODE = ctn.XML_CHECK.value('(/CHECK/@restaurantcode)[1]','int') - 604150000;

    -- 5b) Coupon tồn tại nhưng KHÔNG có giao dịch → chưa sử dụng (không cần flags)
    INSERT @result (STORE, COUPON_TYPE_NAME, NGAY_SU_DUNG, COUPON_ID, COUPON_CODE, DATE_FROM, DATE_TO, FLAGS, GHI_CHU)
    SELECT 0, m.TYPE_NAME, N'Chưa sử dụng', m.COUPON_ID, m.COUPON_CODE,
           CONVERT(NVARCHAR(30), m.DATE_FROM, 120),
           CONVERT(NVARCHAR(30), m.DATE_TO, 120),
           m.FLAGS,
           CASE WHEN (m.FLAGS & 2) = 2 THEN N'Đã sử dụng' ELSE N'Chưa sử dụng' END
    FROM @matches m
    WHERE NOT EXISTS (SELECT 1 FROM CARD_TRANSACTIONS ct WHERE ct.ACCOUNT_ID = m.COUPON_ID);

    RETURN;
END
