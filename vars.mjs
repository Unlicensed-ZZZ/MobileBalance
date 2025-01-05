/* vars.mjs
 * --------------------------------
 * Проект:    MobileBalance
 * Описание:  Глобальные переменные расширения MobileBalance. Модуль для подключения
 * Редакция:  2023.04.19
 *
*/

export const Delay = 1000;                  // 1000 мс = 1 с
export const dbVersion = 1;                 // Версия БД 'BalanceHistory' в indexedDB. 1 = исходная версия

export function sleep( ms ) {               // Функция обеспечения задержки, заданной в милисекундах
//              -----------
  return new Promise( resolve => setTimeout( resolve, ms ) );
}

// Структура ответа на запрос по учётным данным провайдера = записи в хранилище IndexedDB (со значениями по умолчанию)
export const MBResult = { QueryDateTime: 0,  // Date,    Дата и время запроса, первичный ключ (primary key)
                          PhoneNumber: '',   // String,  Номер учётной записи (логин), ключ отдельного индекса
                          Balance: 0.0,      // Double,  Текущий баланс 
                          UserName: '',      // String,  ФИО пользователя
                          SMS: 0,            // Integer, Кол-во оставшихся / потраченных СМС
                          Minutes: 0,        // Integer, Кол-во оставшихся минут (изменено, в ответе 'Min')
                          Internet: 0.0,     // Double,  Кол-во оставшегося / потраченного трафика (в Мб)
                          TarifPlan: '',     // String,  Название тарифного плана
                          BlockStatus: '',   // String,  Статус блокировки
                          TurnOffStr: '',    // String,  Ожидаемая дата отключения
                          LicSchet: '',      // String,  Лицевой счет
                          BalDelta: 0.0,     // Double,  Разница от уменьшаемого - баланса предыдущего запроса
                          NoChangeDays: 0,   // Integer, Количество дней без изменения баланса
                          KreditLimit: 0.0,  // Double,  Кредитный лимит
                          UslugiOn: '',      // String,  Информация о подключённых услугах
                          Balance2: 0.0,     // Double,  Баланс 2
                          Balance3: 0.0,     // Double,  Баланс 3
                          AnyString: '',     // String,  Любая строка
                          Warning: 0         // Integer, Флаг наличия в записи изменений по сравнению с предыдущим запросом
                                             //          Добавлено в v1.0.11. Нужно только в записях хранилища IndexedDB, в ответах плагинов не используется.
                                             //          Используется при отображении статуса предыдущего запроса в списке popup-меню (при наведении курсора мыши
                                             //          на информационную пиктограмму) и для выделения цветом изменившихся значений в полях таблиц окна результатов
                                             //          опроса и окна истории запросов.
                                             //          Представляет собой набор флагов-уведомлений:                 0 ( 0000 0000 ) - нет изменений;
                                             //           1 ( 0000 0001 ) - Баланс без изменений дольше, чем указано; 2 ( 0000 0010 ) - Изменился статус блокировки;
                                             //           4 ( 0000 0100 ) - Изменился состав или стоимость услуг;     8 ( 0000 1000 ) - Изменился тариф
                        };


/* -----------------------------------------------------------------------------------------------------------

Структура ответа на запрос автономной программы MobileBalance по учётным данным провайдера
------------------------------------------------------------------------------------------
{ Balance: 0.0,      // double,   * Текущий баланс 
  Balance2: 0.0,     // double,   * Баланс 2
  Balance3: 0.0,     // double,   * Баланс 3
  LicSchet: "",      // string,   * Лицевой счет
  UserName: "",      // string,   * ФИО
  TarifPlan: "",     // string,   * Тарифный план
  BlockStatus: "",   // string,   * Статус блокировки
  AnyString: "",     // string,   * Любая строка
  SpendBalance: 0.0, // double,     Потрачено средств
  KreditLimit: 0.0,  // double,   * Кредитный лимит
  Currenc: "",       // string,     Валюта
  Average: 0.0,      // double,     Средний расход в день
  TurnOffStr: "",    // string,   * Ожидаемая дата отключения
  Recomend: 0.0,     // double,     Рекомендовано оплатить
  SMS: 0,            // integer,  * Кол-во оставшихся / потраченных СМС
  Min: 0,            // integer,  * Кол-во оставшихся минут (в ответе расширения переименовано в 'Minutes')
  SpendMin: 0.0,     // double,     Кол-во потраченных минут (с секундами)
  Expired: "",       // string,     Дата истчечения баланса/платежа
  ObPlat: 0.0,       // double,     Сумма обещанного платежа
  Internet: 0.0,     // double,   * Кол-во оставшегося / потраченного трафика
  ErrorMsg: ""       // string,     Сообщение об ошибке
}

* - сохранено в структуре разбора ответа расширением для совместимости при адаптации плагинов

Структура записи базы данных (.mdb) автономной программы MobileBalance
----------------------------------------------------------------------
NN                   AutoInc        (прежнее ключевое поле в .mdb. При сохранении в файл значение создаётся по этому номеру записи)
QueryDateTime        DateTime    *  (ключевое поле в indexedDb)
LicSchet             WideString  *
PhoneNumber          WideString  *  (поле дополнительного индекса 'PhoneNumber' в indexedDb)
UserName             WideString  *
Balance              Float       *
ObPlat               Float
BalDelta             Float       *
Average              Float
TurnOff              Integer
JeansExpired         Integer
Recomend             Float
SMS                  Integer     *
Minutes              Integer     *
USDRate              Float
Contract             WideString
PhoneReal            WideString
TarifPlan            WideString  *
BlockStatus          WideString  *
AnyString            WideString  * (удалить из структуры записи, как неиспользуемое ??? )
BalanceRUB           Float
Currenc              WideString
BalDeltaQuery        Float
NoChangeDays         Integer     *
MinDelta             Float
MinDeltaQuery        Float
RealAverage          Float
TurnOffStr           WideString  *
CalcTurnOff          Integer
BeeExpired           WideString
SMS_USD              Float
SMS_RUB              Float
MinAverage           Float
Seconds              SmallInt
SpendMin             Float
MinSonet             Float
MinLocal             Float
Internet             Float       *
InternetUSD          Float
InternetRUB          Float
SpendBalance         Float
KreditLimit          Float       *
UslugiOn             WideString  *
Balance2             Float       *
Balance3             Float       *

* - сохранено в структуре хранилища indexedDB для совместимости при импорте истории запросов
----------------------------------------------------------------------------------------------------------- */
