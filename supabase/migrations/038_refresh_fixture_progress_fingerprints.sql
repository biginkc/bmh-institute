-- Refresh the exact fixture progress fingerprints after migration 031 adds
-- user_block_progress.asset_version. The old projection is reverified before
-- the boundary and checksum contract move forward.

set lock_timeout = '10s';

do $migration$
declare
  v_expected record;
  v_boundary private.fixture_cleanup_boundary_v1%rowtype;
  v_progress public.user_block_progress%rowtype;
  v_old_hash text;
  v_new_hash text;
  v_legacy_definition text;
  v_legacy_definition_sha text;
  v_attester_definition text;
  v_attester_definition_sha text;
  v_old_manifest_sha constant text := '80a4e2cac5e11e28c65605be1f22acccb708670095d0f46d5c14219feafca9a1';
  v_new_manifest_sha constant text := '2ee30597dd997614acc93422d00bbd2874c7438b0dc189d826ea9fbea55c1489';
  v_old_legacy_definition_sha constant text :=
    '1f20fcb5390b85bd1ba3d45166e204bdc947e0ef3ea3f3214a16a1c6aef08b30';
  v_occurrences integer;
  v_live_progress_count integer;
begin
  if to_regclass('private.fixture_cleanup_boundary_v1') is null
    or to_regprocedure(
      'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)'
    ) is null
    or to_regprocedure(
      'private.fixture_cleanup_legacy_contract_attestation_v1()'
    ) is null
  then
    raise exception 'fixture progress fingerprint refresh blocked: controller-gated cleanup prerequisite is missing';
  end if;

  select count(*) into strict v_live_progress_count
  from public.user_block_progress progress
  join private.fixture_cleanup_boundary_v1 boundary
    on boundary.table_name = 'user_block_progress'
   and boundary.identity_key = progress.id::text;
  if v_live_progress_count not in (0, 67)
    or exists (
      select 1
      from public.user_block_progress progress
      join private.fixture_cleanup_boundary_v1 boundary
        on boundary.table_name = 'user_block_progress'
       and boundary.identity_key = progress.id::text
      where progress.asset_version is not null
    )
  then
    raise exception 'fixture progress fingerprint refresh blocked: fixture-owned progress rows are neither absent nor the exact post-migration production fixture set';
  end if;

  for v_expected in
    select * from (values
      ('00f5f22c-1323-4271-82e0-23559e77180b'::uuid, '776393f9fb41ee9139ebf9bef5beef5a50a1dc64e1be56dc6e17e72039cb8b73', 'b338747cb1b9c61d70dfde7113540fc0718f2858fa4cb298ab35d55646aa38bc'),
      ('030abc30-b4e8-4610-bd5f-508b75a3dc9a'::uuid, 'c8de5e8ef5b2ecc9ef93deeb4c6bd8a12a00a7174184479dceb09be1dc8c5d40', '17bab1da161d59dcf90300649376a4697a8b019ac2bccec0897f15bf58036418'),
      ('0606a036-a3be-40ec-926c-b86325fd5476'::uuid, '5029b11b12c2c289f36d60d0bb4a45d28dc22479148ade1e08fe896f774671bf', 'f3d862b9d652d3873c7986199db009019b7fca00f21bb84628b9a71ba25fcd8e'),
      ('098475bd-9e37-4de6-a06c-a264a190e62d'::uuid, '1bd8e50e57df2c676fe92da67771f1616fbc2f8778fd02513c116ee7c4253032', '3eb90fbb03372a37e3ec0de51d8450830f2c53d756dc87bdd7561e2a5a2d02f8'),
      ('0df0cd7b-76a8-474b-b6de-94e56e988e54'::uuid, '471366d82bb65dd104475a93ff5aed6aa5b9b7ee803c598bb0d4d0d7ce5e5bcd', '04a697275441af4da87bccfa7c7a6e08bced13d2d3bf9b22de968d6cf4c57494'),
      ('0f95cb00-d2dc-4ca8-b8c6-b16adaecc8d7'::uuid, 'ac6ba26662b878d8ebab4fd9cac46c48233761c673da1f759b9780a0f0dd8f4a', '3d744be0844f5099742d262993474d6706e888c2f6147ef40d1d309e56819872'),
      ('166d2398-a439-418e-a851-f5a54fadfe71'::uuid, '9c5d5de4c195f88ae5df909774f98ecb3e79d37b3e73fab0e81c010cb248e9db', '8d749d67eab2b74a642ab7a82af0335a3e6814dfdde3f2f19be3adb6e3927e46'),
      ('1b0ac9ea-3847-4d52-8abf-e5e65abdda5f'::uuid, '9ba11e7186203108b3138ae3d7af696de3253cf5cf440f2485ed9fea61085dbd', '996d8623a4bc2a95c182c09c6d6bd33fa891e7427cfc68469fab74a786c8db6d'),
      ('21782d25-fdeb-42dd-9e8b-279660bf3f49'::uuid, '91509aa05e720b5a9709290e5ab2a5791bebe89b3726d6e1840d5c684db590fa', '736a2c992115ab3d8ff1965bd98bb6973d2eb43f1913e2299322d32201dc0bdd'),
      ('2427f3af-3596-4c57-bc01-e3fbecca1066'::uuid, '9e306180280bb6f262b320e7d5aecff69c91626d675abb4a55a23cdeb815bee5', 'a8426beb9fde1341263e179865280d43ae5f169075118dc9089360ad4902a3fa'),
      ('249bf269-9ce3-4924-8132-1a953824fa87'::uuid, 'd3f3a179e34fd9cf51790cdb079d4157976661eab725816e79b8c6df03577e56', '950bc66d0a707e13b6f4864ce64c615cea4f0d1424059c06774cb55fbf3f00db'),
      ('258697d8-13cc-46bc-b3ba-a8486a7d887b'::uuid, 'b7d6e8a78176cf19fc4202a4debc4764a50c7bf3919ce29cfcbc30db3a6757df', '9381e7fb1516cac4a84a16141532dbcc17b89896762d3a924a29611f1b34adf4'),
      ('276e2c6b-4c0b-4f36-be92-b7ac98749fee'::uuid, '05bd63857f55ab59345c70c31014bf175ce8c92060c147f7b36660606c622ad3', '063c4975a61e84f4de4582feb5f1cabc54540095510af094b6eb10ff84eaa930'),
      ('2a46e977-9277-434e-b51c-8bfcd9cee2e7'::uuid, '3b281cb5dc28e34587d50704e314b5fce12ad333c308e78162689d67ae6349d6', '02e09c9bddc2f035e69547a2b00df0efc11d860763cb61d6f8488641f0b349e1'),
      ('2b7c1a10-3a72-403f-9b5d-651723725d78'::uuid, 'b1d86b9b02e3650dd981ce36caa1ddc63550b5d4dc55433c560d3d04ea766b45', 'cba2ecdf771a777ad7dfd57cb2ff8d7e55a67350fb95cc603776516a938a5633'),
      ('2c7863dd-5361-4cb6-a5b9-c5a447492e13'::uuid, '81973f45b8b1f20efca80bce72b5d10406c59a637994407686848310ce92fdb4', '788ddd313d1de2cf326359453a2346a37c18765259ca663e29de414c492a76c1'),
      ('3a5c5a52-2955-4c7d-bfb8-1912e3552890'::uuid, '6acb933aaa17e1d7c2f24b11b0f5b341da9c8162a9947777549f9eaf3d8f9252', '2de6378ce38d5c0823c3281cb42c6caaedfa8db7e950d9a3c5de653643e7f026'),
      ('3be14555-ee0b-41aa-b6be-68b2f8f93d85'::uuid, 'f77b04d56b525c1f8093d849158430384dbfacbb3fca21d550ae07e8d6c717b2', '2af55e3b0548c3ac1eb46f47bb26ed94801538cfe0bd769b5e29aab5e26a3014'),
      ('47487e58-2781-44b1-a5ba-dab71fcb0277'::uuid, 'eef84dbf578c87bede74679dba8af12d92e923fa10b07ce7cd465fbcb66a0c1d', '37eebf0e4a73673b2c65c5643d7f34552ecb7cbd55b522d0321214b029bfe835'),
      ('476d8788-41db-4714-945f-584cc226cf39'::uuid, '6b2c7175e4353c462f023066cb92b286c6fc1777ec09153646941e2b8ac93906', 'aeb8163c79b9f826253fe47843caf1eca81de14d1e54aa264ba56b8772c7c057'),
      ('48d4d111-90a0-4fdc-b928-59b4f72da98a'::uuid, 'a811fa10e890551c35356fb261427e6ac0e6bf1edbc28f35e051f2410bc26409', '96d387b5f61780a6c7a41d983da4ea1a00e05529e8ac4bc7063e3b619c6d9e18'),
      ('49bbe9f5-b03e-4c0d-88a0-1cea1ec344b7'::uuid, '3c2291a8a5d647451fd592f4ca40d3d1a7635df5e2c275426f774d9a6ba232e6', 'ab7b250c0e8642b79e5b3b30f2011f930ebaedbba16d869f6eefcb9baf0b26cd'),
      ('4dfe28be-6ca0-4349-b8fb-0689fa036081'::uuid, '2aa96898f67e5bc254888d870d68bbf14f2b38b22b3f71df86cec5c605efef92', 'a61f37b8ce8546e6a22b43a7c40c623668b72bbc264fd77c25f3df825d0d424b'),
      ('4ee94cd3-2b97-4315-aa57-34d169ae0b94'::uuid, 'df577267c82ba62911807b8165ca68543bf1178a2d5e7f89a6ef3f051b669e36', '7eb618d6f40b33c3068ba0a5983e7bcc68537de1093be2d1e2a27700e93124eb'),
      ('57f239d3-b83e-42e1-9da1-f255a569d123'::uuid, '4f819ca22d837e6c570c2755f8010cf99321dab1012315b03e9e0f4d52d82482', '35a74b71c04846859882f503b440e87d20e4100be0e844b96fbd2e57d977e232'),
      ('5b4a9194-70f1-40c4-a0a5-96d6e0a31daa'::uuid, '636aeb3bc612a1d2066ac9098c8342f1559233d57454097836d97a35e7e3a426', 'aafba3a74ea7d65478497e368e0ced9f5a4de87d199fd6eb9f0d097c1f20d76c'),
      ('6022c84a-7fca-413a-b58a-48abdefeb670'::uuid, 'b4c63e3ef40c329cf2cd617accd2b0189d62984ab4ec49f690ce3a4d0c789874', 'f3f31efb836c0ccda7c46059cf57e28402352f524936934f55b1ccf6f0d4f1a3'),
      ('652ef0e4-bdc0-4ff9-ad23-76d9b17392cf'::uuid, '23aa25480ae9b7a10962e8180f866945c2b2d527da7a95f52439cb73a7c77d37', 'b0f47fe8953f19d6a95593863e88bc967646817cdeb71f486955cb72d7e8ba64'),
      ('69456487-4e65-418f-abdd-f276e3d5d8c4'::uuid, 'a02973c2d4961646c0d33e333413fcd4312ec032beba2636e6cbad03642362c4', 'cc3549c71aedcfcf561ef051173cd9b9f22201feb522fc1fd8d3f799616de5a5'),
      ('6a9bab37-a5d4-4825-8457-49da3650e30c'::uuid, 'bf3195e9f8f17350658e184ae0fdcf1ae2a1dde16e8aa9000a34aded160bb3f6', '3525f2b0da0a00cc0e7ecf0ebb4c8163f576e38c99ced2fb2e6101198ad7538f'),
      ('76e7e31c-c79e-4687-909e-48d1e63a1655'::uuid, '9914ba0c035010ae27e698028b259734f04c5aa000aab485d4543a9308f03f29', 'b25925b9bd30fda324f5be6a292ebe6c8d591de10cba01ff94ab4d8ce30b10ac'),
      ('78c7ad57-f5b4-4115-b8ae-add60452eaa0'::uuid, '6dd5e237089e34ca139135d1557e6c2a952a521391db6aa6e62cfb3953b44b77', '403b68e9f87b539cfe52b734dd1fb1c21d8565ee715418a35559cc97d4977f95'),
      ('83493f1d-1925-4a97-8631-12437e617ea3'::uuid, '019fdbd0871750a0d3a77344e49d2c5b7717e28977372c5fbdd5d25f2a44b6d0', '1dbf13e84ecada1437ea1bb3dd1fcb93779bf2e996d4b562a0649444ecc70837'),
      ('875056ff-b7c6-4662-a457-99b6659cff6f'::uuid, 'f2520b5e2fa1bbd611655976c64af07b10a1bd0ab9aea3f3df3f1b83e6388003', 'b68fce90e46f3d9d657e15cc0468b42d33343ddf49d62ba4131d7548c31aa86b'),
      ('885176a4-27a5-4cc8-a44c-1d4ca2a998d6'::uuid, '7ff9e78ef82fb3459ec303d9bb59fb3409e34f5f09c66f90ee9ef9925f652c30', 'eaf388c7cab74c49eef5fa6d54c4db68f408a24a5f1a37cc7e4008ba1b596197'),
      ('8ab4eecd-f484-4976-8b58-4c83df9dd2a9'::uuid, 'bfdd9ce9ec1a73a8139c5f8813615ef90afaffa334e007443aad75713f439647', 'e400dbe831cce761821f3c63082b414afb39161b658b46c847efaf2a0c810068'),
      ('8c6aad35-5e95-426c-bbc4-e20455fc03b1'::uuid, '58ddaff267800b7af1bace6a03a96ed57f159b63b23f39b6e400dd5eef8197e7', 'b942152e7776ffabed2033e73352092e6209c0911a45aa86287dc68b6d7353e0'),
      ('8f4eaa57-22c1-49df-beec-89e983280c7e'::uuid, 'a6aa13b95ec15df9abf77ca7264d2f2d54f2dbf4bae1a12446db0b1d0767c9d4', 'df27464bc5bdef0fd5595c3af8e41ffb56a4adde1891d8208b5be6cf0c3e9ec5'),
      ('92e3c07d-8903-445f-84bb-6bc6540b85f8'::uuid, '669364d5edbe219f9ba9c5471c3cd24993845816a55fe779ba258bf0632b2d71', 'a3382bbcc2a433646b3c5617db6fdec2328a3972abbea7c17fe65e75bee25b46'),
      ('981ebd31-8109-436d-a08b-4f13e5f8ce2a'::uuid, 'b3cea27eeeb10c83a5c919979d413f35ce0fb451d317cf01085c8a354e8e87fe', '9ba3ba937c7d9ec52894efeaf1abe2e56fc23d9a2f89f2728c72ae43216ec8c4'),
      ('9b9d88a4-b5f6-452f-8305-3a3ad1abfc35'::uuid, '088374253c180c848ca027d0bd0a55a5ed3ae81d376f259570447661671c93aa', '3f4d62e5e81baf7ef5ab63276092e629cf2483816a7061e7b291e918fe439891'),
      ('9bcf4072-3a9c-443a-8496-254854182235'::uuid, 'd6504781166517f7b92585724c3aab75667446c11af60f3db648574fcddd931c', 'b618f7c0def902a20a36465ae4e62025a7bf041a93d72d7d83b09c9532b71be6'),
      ('9eb91323-836b-4ea9-aea2-b8df502d919f'::uuid, 'af146f3620abc1ab5962b51964c92a781bb3aaf226e0e0bd92b3cb7b35f120d7', 'fc46a37e949377f6e89eae1a69d12dd942a5382db86f359655fe9b3e898ee730'),
      ('a397405e-7cc7-4338-929e-5467461be608'::uuid, '4517592b7b11a85e3478feb31dd51ae106411dfa5a47e8b35d8904b517a1710a', '6e714fd424950eac95fd4da99b743603b2671d75bae1cc1d1b646923b9bc2eb9'),
      ('a533763a-6bdb-490a-94d3-28af6366ef88'::uuid, 'd47777c22c025f4cac27208ffefa6c6948deaa0f90793429b6fd5430327d8ec2', '564b73a4f663e965cf38d80becedcedbba0790b9da89190daa12d146afe1a641'),
      ('a5d723f9-fdd6-4f0b-a9ea-e0c5dbd07de0'::uuid, '0ddda5e644cba195ed3e80a7a039c1b6931a7c52c21ebff15ad04171decb3d00', '5dd27b2bad08d37159252f08e2275fddc0e85045ca1526c848c59d3ca52e2deb'),
      ('b311a421-b7c1-45bf-923e-4f3d149fd075'::uuid, '31e4645b5eb273f293eafd32089b4284848f6fb4daaa2ebca6fcf2650d48d293', 'deb2d5b168f3a4520fbe8c6d9be1b7c22d25f9c512c8b426fe072b1e1e93ace6'),
      ('bc6e1713-ef12-4152-a480-ae0e94bd418f'::uuid, '61fc6ce1d9706d0e217bfc4b2e747aaf03ea17892c62d8347ec2b0de028db62f', '0a8879c97f5febc0be7ff6a82c45d54a862ffeebf42d455e976896d2a1372370'),
      ('c37fcba6-b998-44b0-9f78-c7cfcae8f25b'::uuid, '905de1a7ab1aa17de67e20cb935a6cffd119a5acccdc42645997701ff14a1028', '423027633671a2c8090d9281518de62f94f4cb672c64328d75d3dd94a530ad7a'),
      ('c994750f-dead-4a3b-a877-22e35188731a'::uuid, '9da1584cee4e0b6fe7aa6877e4885941d8145b49df8994b65b031ce5e4277b2a', 'e0e43d56301909900157b16c6e9eccc5ae4c6970aff829b99042f7678a098d17'),
      ('cb29a084-c36c-4571-b8a4-dcf568f78e6c'::uuid, '7f955aa832448e27677c92944c05070049a9abd0b0b43d1716195ea276b8f133', '1a55611bdcb7462c2901145125cebe47fcfa677c6c72bbb11c1210f667786895'),
      ('d2df8680-96ef-494f-9391-d61d1a469683'::uuid, '4205f2f3d41e7bb5dad248ecddc14f4154a62e0740f938ad8d414d2152072307', '4e42a8a7140c82ff2fdd082a02b0b9748c4e22ce6486186ca8388da78e873968'),
      ('d9a608b3-3c0f-4a58-86da-40313fee68a0'::uuid, '4c5efd705864cac99bcf52aba78c4381bf923e4d73c76d0fd48e870a7c563670', '68fad6cdba5244b9404a07ff7620a1103656d1e8492b65ad74a4ed6f220f45e4'),
      ('dc48bee8-5552-4fcc-8304-bac2308b191f'::uuid, '1037cafe4b71c366f38e0f85247d42250412cb6312fd5a268bb0bd2fe76cf8da', 'f01dbd12d2bbb21d3c99d06ebc06c8c44d8ca1945694305c1100c00c0ccbf33c'),
      ('ddbc07a2-5fd7-4e52-9f2a-b472191c6da1'::uuid, '4843134d671a48ef11e847299e044577ba4f0773915659a4a87aaeec75f3b47c', 'c28561add91abc5d65a6478ff79ce18178e469e7e283bca6d77d1385b5ded875'),
      ('e3f86e6e-17f1-4a26-8391-0ab0ae03658b'::uuid, '78b3ba1394d0acd286aec9c57b12a20db4fd9aa625a31be28a2c175b6e445eb3', '26a51578406588deec7651eb3e14e9dd2df19f7be61c27def90b265096186981'),
      ('e51776a7-9131-47aa-a87d-ce401c53af37'::uuid, '844de232b797dff60d47e9c7c40b38837cfb59d20a0fc6bd48d3611579d7e9af', '7a1b066393c5e70dc23dd2ab49a60a771f7cd0affde580aeaf245ea4b46a1360'),
      ('e6fe9932-9fde-4ca3-bb9c-d6341ab1e690'::uuid, '7e2200652ed51e0c2b133edb65ba33f7e53e144b92cda899a29c65a959fc0ac2', '678dbbf8acca24eff19988c090f1325fc6d1658e0188396bc4284173de76a34a'),
      ('e7787302-e044-45d0-ac3d-45c62c272d38'::uuid, '76eb5d5ea258df92d21bc6a15ff967327ece6bee47022cfe24d8a20229c906bd', '98fe8abd57d3bd8c2cb336dc21dc98c2e8c078bbc4cc97561d5174d10118c8af'),
      ('e9600426-11a8-43ea-978f-99c474648a14'::uuid, 'ac2a412010db40180ed83c3d47c6daf108db1a4eed45400ee64b2bb133da5dbd', '6b0aa566c20a5c347e5d5844093185d83cfd01aacd72f945a9e6caba7a842513'),
      ('e9800c74-2542-4b20-bfcc-cbd73d5da793'::uuid, 'f140dd1343f69b1c8d7265e7b3a03c215ac7659ceca8ccd5939596c086a79a42', '96d92b89f5b956b21a747d0a02acff420dde89d793e584ddcd35007f203d6af7'),
      ('eb03af3b-f673-4e53-8af4-45123170968f'::uuid, '3004ef1d3111e068d3ffdb4268bd74e7b032ed7c2cbfcddf6bd5546bb8fe4c1e', '0a0e1508a9b641cfe6f976c684733e27972244f257d4da08d2d8532604c325c5'),
      ('ebc2cbd7-1faa-4b24-8419-7b47085caa23'::uuid, 'b17e1dc9b5c6e16c0487df601a8e70ac897ded8031eba5bd23e5a0fc68f7dd99', 'e9a2666e532da00999c16e7550145b70409edeac9b4dab39b89fed4263a75c93'),
      ('ed1d33d9-b1c3-4dbb-a974-d399abd4b1f0'::uuid, 'f5e22da933b6a04a43a57e79e2f16029a173e8e677203f21fbae809e8222070c', 'c2c44f88d8c1ee3b5d556915f74756733bdc547950e0e6bd6a9e79088a8b481e'),
      ('fc1e9ac7-a881-41bc-afa0-4d4be8602910'::uuid, '742857e649cd6635c78b2f82168ca7bf47f21a744a0d8f8ada77785a9732fa88', '35d91d364fe30e64853c5ec0c654f28bcd60fc26171b96a5c3511f2198138276'),
      ('fe26f24d-8528-4992-bb31-019d170bed38'::uuid, '157ea8b936dfa53430f26e636d5ceab5cbc561b808d6111668d74c1e7a00abd2', '841798b2504b818e9af9660c5ad0357628ef57e060aeb4ebcc9c456c4a8528d4'),
      ('fe86e1f5-3b3d-48db-ba7c-7a0be3fd0ea6'::uuid, '191c92c2ffd05a372cf3acf28161b541153b1a06dae815597b9727dd44715594', '64c6e281986d937a309b2b9857b6e25381e67e63d68f9133564bd34405e46fbf')
    ) expected(id, old_hash, new_hash)
  loop
    select * into strict v_boundary
    from private.fixture_cleanup_boundary_v1
    where table_name = 'user_block_progress'
      and identity_key = v_expected.id::text;

    if v_boundary.fingerprint_fields is distinct from
        array['block_id', 'completed_at', 'id', 'user_id']::text[]
      or v_boundary.row_sha256 <> v_expected.old_hash
    then
      raise exception 'fixture progress fingerprint refresh blocked: prior boundary drift for %', v_expected.id;
    end if;

    if v_live_progress_count = 67 then
      select * into strict v_progress
      from public.user_block_progress
      where id = v_expected.id;

      v_old_hash := encode(
        extensions.digest(
          convert_to(
            private.fixture_cleanup_canonical_jsonb_v1(
              jsonb_build_object(
                'block_id', v_progress.block_id,
                'completed_at', v_progress.completed_at,
                'id', v_progress.id,
                'user_id', v_progress.user_id
              )
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      );
      v_new_hash := encode(
        extensions.digest(
          convert_to(
            private.fixture_cleanup_canonical_jsonb_v1(
              jsonb_build_object(
                'asset_version', v_progress.asset_version,
                'block_id', v_progress.block_id,
                'completed_at', v_progress.completed_at,
                'id', v_progress.id,
                'user_id', v_progress.user_id
              )
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      );

      if v_old_hash <> v_expected.old_hash
        or v_new_hash <> v_expected.new_hash
      then
        raise exception 'fixture progress fingerprint refresh blocked: live row drift for %', v_expected.id;
      end if;
    end if;

    update private.fixture_cleanup_boundary_v1
    set fingerprint_fields =
          array['asset_version', 'block_id', 'completed_at', 'id', 'user_id']::text[],
        row_sha256 = v_expected.new_hash
    where table_name = 'user_block_progress'
      and identity_key = v_expected.id::text;
  end loop;

  if (select count(*) from private.fixture_cleanup_boundary_v1
      where table_name = 'user_block_progress'
        and fingerprint_fields =
          array['asset_version', 'block_id', 'completed_at', 'id', 'user_id']::text[]) <> 67
  then
    raise exception 'fixture progress fingerprint refresh failed: refreshed boundary count mismatch';
  end if;

  select pg_get_functiondef(
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)'::regprocedure
  ) into strict v_legacy_definition;
  v_occurrences := (
    length(v_legacy_definition) -
    length(replace(v_legacy_definition, v_old_manifest_sha, ''))
  ) / length(v_old_manifest_sha);
  if v_occurrences <> 2
    or position(v_new_manifest_sha in v_legacy_definition) > 0
  then
    raise exception 'fixture progress fingerprint refresh blocked: legacy manifest contract mismatch';
  end if;
  execute replace(v_legacy_definition, v_old_manifest_sha, v_new_manifest_sha);

  select encode(
    extensions.digest(pg_get_functiondef(proc.oid), 'sha256'),
    'hex'
  ) into strict v_legacy_definition_sha
  from pg_proc proc
  where proc.oid = to_regprocedure(
    'private.admin_cleanup_fixture_catalog_v021_without_controller_gate(text,text)'
  );

  select pg_get_functiondef(
    'private.fixture_cleanup_legacy_contract_attestation_v1()'::regprocedure
  ) into strict v_attester_definition;
  v_occurrences := (
    length(v_attester_definition) -
    length(replace(v_attester_definition, v_old_legacy_definition_sha, ''))
  ) / length(v_old_legacy_definition_sha);
  if v_occurrences <> 1 then
    raise exception 'fixture progress fingerprint refresh blocked: legacy attester contract mismatch';
  end if;
  execute replace(
    v_attester_definition,
    v_old_legacy_definition_sha,
    v_legacy_definition_sha
  );

  select encode(
    extensions.digest(pg_get_functiondef(proc.oid), 'sha256'),
    'hex'
  ) into strict v_attester_definition_sha
  from pg_proc proc
  where proc.oid = to_regprocedure(
    'private.fixture_cleanup_legacy_contract_attestation_v1()'
  );

  update private.fixture_cleanup_expected_function_contracts_v1
  set expected_sha256 = v_legacy_definition_sha
  where contract_name = 'moved_destructive'
    and expected_sha256 = v_old_legacy_definition_sha;
  if not found then
    raise exception 'fixture progress fingerprint refresh blocked: moved contract registry mismatch';
  end if;

  update private.fixture_cleanup_expected_function_contracts_v1
  set expected_sha256 = v_attester_definition_sha
  where contract_name = 'legacy_attester';
  if not found then
    raise exception 'fixture progress fingerprint refresh blocked: attester contract registry missing';
  end if;

  if not coalesce(
      (private.fixture_cleanup_legacy_contract_attestation_v1() ->> 'safe')::boolean,
      false
    )
    or not coalesce(
      (private.fixture_cleanup_controller_contract_attestation_v1() ->> 'safe')::boolean,
      false
    )
  then
    raise exception 'fixture progress fingerprint refresh failed: controller contract attestation is not safe';
  end if;
end
$migration$;
