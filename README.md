# MobileBalance - расширение для Chromium-браузеров
Предназначено для получения баланса номеров (или иных учётных данных) провайдеров. Является одной из альтернатив программ агрегации баланса провайдеров для персональных компьютеров.

Работает на основе эмуляции входа пользователя в личный кабинет провайдера в браузере по учётным данным (логин / пароль). Язык русский, в силу особенностей аудитории иная локализация не предполагалась.

Распространение и использование расширения для пользователей бесплатно (и оплата не предполагается).

## Предпосылки
Расширение разработано на основе идей прототипа - автономной программы с одноимённым названием. Автономная MobileBalance была разработана для Microsoft Windows, основана на взаимодействии с MS Internet Explorer и хранении данных в формате базы MS Access. С 15.06.2022 Microsoft прекратил развитие и поддержку IE. Подавляющее большинство провайдеров уже отказались от обеспечения совместимости с ним своих сайтов.

Сопровождение автономной MobileBalance со стороны автора также прекращено. Последняя версия программы (18.3) была выпущена 08.05.2018. Сайт программы упразднён.

Несмотря на развитие мобильных приложений провайдеров, дающих информацию о балансах своих абонентов, агрегатор подобный MobileBalance остаётся востребованным. Автономный MobileBalance предполагал возможность расширения опрашиваемых провайдеров за счёт написания подключаемых JSMB-плагинов. Она была благоприятно принята сообществом - после прекращения поддержки плагины долгое время актуализировались и развивались энтузиастами (до момента, пока сайты провайдеров сохраняли работоспособность при обращениях от устаревших механизмов IE).

Для персональных компьютеров единственной известной автору альтернативой является [MBPlugin](https://github.com/artyl/mbplugin). Сильно упрощая его работу (для интересующимся - предыдущая ссылка), он сопрягает базы автономный MobileBalance с актуальным браузером (Google Chrome), при этом заменяет большинство плагинов их python-аналогами. "Жизнь" автономной MobileBalance за счёт MBPlugin возможно продлить. В качестве разработки аналогичной направленности под Android следует выделить [AnyBalance](https://github.com/dukei/any-balance-providers). Из Google WebStore она с недавнего времени пропала, но легко [обнаруживается](https://www.rustore.ru/catalog/app/com.dukei.android.apps.anybalance) на RuStore.

## О расширении
Разработка расширения ведётся с 24.11.2021. Первая версия опубликована в [Google WebStore](https://chromewebstore.google.com/detail/mobilebalance/oogdlalfhmhjbdbgefpgmdhmfnjnlggo) 23.02.2022.

Учётная запись, позволяющая публиковать расширения в магазине расширений Microsoft, более полугода на подтверждении. Вопрос не решается (очевидно, по причинам текущей политической ситуации).

Полную историю изменений расширения можно посмотреть в его настройках, на вкладке "О расширении"

- Расширение ориентировано на работу в Chromium-браузерах. Опубликовано в [Google WebStore](https://chromewebstore.google.com/detail/mobilebalance/oogdlalfhmhjbdbgefpgmdhmfnjnlggo);
- Расширение не производит никаких пересылок чувствительных данных по сети. Учётные данные сохраняются в локальном хранилище расширения (только на том компьютере, где оно установлено). Пароли дополнительно кодируются и декодируются непосредственно перед их использованием для входа в личный кабинет провайдера;
- Плюсом расширения является кроссплатформенность. На текущий момент работоспособность проверена в среде MS Windows (Google Chrome, Yandex browser, Microsoft Edge) и Linux (Chromium на базе Debian);
- Код расширения открыт, оно может быть дополнено новыми возможностями;
- Плагины и код расширения обильно прокомментированы, что упрощает для желающих изучение их работы;
- Предусмотрено дополнение коллекции плагинов расширения плагинами разрабатываемыми сообществом;
- Плагины расширения по алгоритму работы аналогичны плагинам прототипа. При этом они имеют большую свободу в использовании современных языковых конструкций JavaScript, на котором они (как и само расширение) написаны;
- В составе расширения есть выгружаемые файлы с кратким руководством по подготовке плагинов и описанием структур данных;
- Структура данных, принимаемых при опросах, и наименования её полей унаследованы из автономной MobileBalance (для совместимости). Хранение данных обеспечивается механизмами браузеров - LocalStorage и IndexedDB;
- Данные настроек и истории запросов могут быть сохранены в локальные файлы и загружены обратно в расширение. Локальные файлы параллельно играют роль резервных копий данных;
- В расширение (после необходимой обработки) могут быть перенесены данные истории опросов из базы автономной MobileBalance.

## Текущий состав коллекции плагинов
Актуальные данные можно посмотреть в подсказке на пиктограмме **(?)** к выбранному провайдеру
_(Настройки расширения -> Общие настройки -> подраздел настроек провайдера)_
| Плагин | Описание |
| ------ | -------- |
| МТС (API) | <i>Запрос данных оператора связи МТС (через API)</i><br><b>Забирает:</b><br>- баланс;<br>- кредитный лимит (если он есть);<br>- кэшбэк (если он есть, в поле 'Баланс2');<br>- остаток пакета минут;<br>- остаток пакета SMS;<br>- остаток пакета интернета;<br>- ФИО владельца;<br>- наименование тарифа;<br>- дату завершения оплаченного периода;<br>- статус блокировки;<br>- состав услуг ( формат: 'бесплатные'&nbsp;/ 'платные'&nbsp;/ (сумма по платным) ) |
| BeeLine v3 (API)<br>_рекомендуемый_ | <i>Запрос данных оператора связи BeeLine (через обновлённый API) с авторизацией в форме сайта BeeLine и авторешением капчи</i><br>При авторизации плагин однократно пробует решить капчу. Если попытка неуспешна, то плагин пробует решить капчу повторно и ждёт подтверждения ползователя. В этот момент значение можно исправить вручную или использовать кнопку обновления капчи<br><b>Забирает:</b><br>- баланс;<br>- остаток пакета минут;<br>- остаток пакета SMS;<br>- остаток пакета интернета;<br>- наименование тарифа;<br>- статус блокировки;<br>- состав услуг ( формат: 'бесплатные'&nbsp;/ 'платные'&nbsp;/ 'по&nbsp;подпискам'&nbsp;/ (сумма по платным) ) |
| BeeLine v2 (API) | <i>Запрос данных оператора связи BeeLine (через обновлённый API) с авторизацией в форме для ЮЛ</i><br><b>Забирает:</b><br>- баланс;<br>- остаток пакета минут;<br>- остаток пакета SMS;<br>- остаток пакета интернета;<br>- наименование тарифа;<br>- статус блокировки;<br>- состав услуг ( формат: 'бесплатные'&nbsp;/ 'платные'&nbsp;/ 'по&nbsp;подпискам'&nbsp;/ (сумма по платным) ) |
| BeeLine (API) | <i>Запрос данных оператора связи BeeLine (через старый API)</i><br><b>Забирает:</b> (не для всех тарифов)<br>- баланс;<br>- остаток пакета минут;<br>- остаток пакета SMS;<br>- остаток пакета интернета;<br>- наименование тарифа;<br>- статус блокировки;<br>- состав услуг ( формат: 'бесплатные'&nbsp;/ 'платные'&nbsp;/ 'по&nbsp;подпискам' ) |
| Мегафон v2 (API) | <i>Запрос данных оператора связи Мегафон (через API)</i><br><b>Забирает:</b><br>- баланс;<br>- кредитный лимит (если он есть);<br>- остаток пакета минут;<br>- остаток пакета SMS;<br>- остаток пакета интернета;<br>- ФИО владельца;<br>- наименование тарифа;<br>- номер лицевого счета;<br>- дату завершения оплаченного периода;<br>- состав услуг ( формат: 'бесплатные'&nbsp;/ 'платные'&nbsp;/ (сумма по платным) ) |
| Т2 (API) | <i>Запрос данных оператора связи Т2 (ранее Теле2), </i><u>требуется начальная авторизация на странице запроса</u> по коду из SMS или письма эл. почты<br><b>Забирает:</b><br>- баланс;<br>- остаток пакета минут;<br>- остаток пакета SMS;<br>- остаток пакета интернета;<br>- ФИО владельца;<br>- наименование тарифа;<br>- дату завершения оплаченного периода;<br>- статус блокировки;<br>- состав услуг ( формат: 'бесплатные'&nbsp;/ 'платные'&nbsp;/ (сумма по платным) ) |
| МТС. Решения для дома (http) | <i>Запрос данных оператора связи МТС для сервиса 'Решения для дома' (ранее МГТС)</i><br><b>Забирает</b>:<br>- баланс;<br>- номер лицевого счета;<br>- наименование тарифа;<br>- ФИО владельца |
| АКАДО Телеком (API) | <i>Запрос данных оператора связи 'АКАДО Телеком'</i><br><b>Забирает</b>:<br>- баланс;<br>- номер лицевого счета;<br>- ФИО владельца;<br>- дату завершения оплаченного периода |
| WiFire (API) Интернет | <i>Запрос данных провайдера WiFire (через API) по Интернет-подключению</i><br><b>Забирает</b>:<br>- баланс;<br>- наименование тарифа (Интернет);<br>- номер лицевого счета;<br>- ФИО владельца;<br>- дату следующего платежа;<br>- cтатус блокировки |
| Автодор-Платные Дороги (API) | <i>Запрос данных 'Автодор-Платные Дороги'</i><br><b>Забирает</b>:<br>- баланс;<br>- бонусные баллы (если они есть, в поле 'Баланс2');<br>- номер лицевого счета;<br>- ФИО владельца;<br>- статус блокировки |
| Тройка-кошелёк (API) | <i>Запрос данных кошелька карты 'Тройка' (через API). </i><u>Требуется начальная регистрация в личном кабинете (ЛК) на 'mosmetro.ru' и привязка в нём карт</u> (физических, для виртуальных не опробовано).<br>Логин - номер карты, пароль не используется.<br>При первом запросе ЛК должен быть открыт или нужна однократная авторизация (вход в ЛК) на странице запроса<br><b>Забирает</b>:<br>- баланс кошелька;<br>- сумму ожидающую записи (если она есть, в поле 'Баланс2');<br>- статус блокировки |

## Разработка плагинов для дополнительных провайдеров
Можно ли разработать плагин для провайдера X? Можно попробовать, но для разработки и тестирования нужны учётные данные по этому провайдеру. Если вы их предоставите - будет с чем пробовать поработать. То же самое касается различных тарифов, которые могут отрабатывать в разработанных плагинах не так, как вы этого ожидаете. У меня нет возможности протестировать все существующие варианты ответов для всех провайдеров.

## ToDo
Автономная MobileBalance выполняет запросы последовательно по списку учётных данных. Этот последовательный режим опроса обеспечивается и в расширении. Из ещё не реализованных задумок - реализовать параллельный режим опроса провайдеров, при этом для учётных записей каждого провайдера проводить запросы по списку учётных данных последовательно.

## Контакты
Для общения можно использовать:
- [Issues](https://github.com/Unlicensed-ZZZ/MobileBalance/issues) здесь, на GiHub;
- профильную тему на [4PDA](https://4pda.to/forum/index.php?s=&showtopic=985296&view=findpost&p=114094620) (предпочтительно для приватных обсуждений в Личных сообщениях, включая передачу чувствительных данных);
- указанную в профиле **электронную почту**
