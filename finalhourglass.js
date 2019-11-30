class FishnChips {
    init() {
      let amb = ["amb1","amb2","amb3"] //replaced with actual account names on LAUNCH
      storage.put('ambassadors',JSON.stringify(amb));
      //the price of the token
        storage.put('tokenPrice', '1');
      //divs are calculated in profitPerShare, similar to the original PoWH3D Design.
        storage.put('profitPerShare', '0');
      //A simple counter to keep track of the IOST in the contract. Only used as reference.
        storage.put('iost_in_contract', '0')
      //The current supply of CHIPS
        storage.put('chipsCurrSupply', '0')
      //divs are calculated in profitPerShare, similar to the original PoWH3D Design.
        storage.put('profitPerShare_fish', '0');
      //The current supply of FISH
        storage.put('fishCurrSupply', '0')
    //How many tokens are voted onto the node.
        storage.put('voted', '0')
    }
  /**
   * Allows MC or Justin to withdraw any airdrops for IOST voters such as LOL, etc.
   * IOST cannot be withdrawn from the contract using this command.
   */
    claimAirdrops(token,amount){
      if(token == "iost"){
        throw 'iost cannot be withdrawn.'
      }
      if (blockchain.requireAuth('kingofiost', 'active') || blockchain.requireAuth('dividends', 'active')) {
          //MC or Justin may withdraw any airdrops for IOST voters such as LOL, etc.
          //IOST may NOT be withdrawn.
          blockchain.callWithAuth('token.iost', 'transfer', [
              token,
              blockchain.contractName(),
              'escrow', //FRY Investment fund account
              amount,
              'Withdrew ' + amount + ' of airdropped tokens.'
          ]);
        } else {
          throw 'no permissions'
        }
    }
    /**
     * Ambassadors use this function to buy in at any time before the December 1st launch.
     */
    ambassadorBuyIn(account, amount) {
      // if (!blockchain.requireAuth(account, 'active')) {
      //     throw 'no permission!';
      // }
        if (account==blockchain.contractName()){
          throw 'err';
        }
        let ambassadors = JSON.parse(storage.get('ambassadors'));
        if (ambassadors.indexOf(account) === -1) {
            throw 'sorry, you are not an ambassador...'
        }
        let public_start_time = Number(1575237600); //december 1st 2:00pm PST
        let current_time = JSON.parse(blockchain.blockInfo()).time;
        current_time = Number(current_time) / 1000000000
        blockchain.receipt(JSON.stringify({
            current_time: current_time,
            public_start_time: public_start_time
        }));
        if (current_time >= public_start_time) {
            throw 'ambassadors may no longer buy in'
        }
        if (new Float64(amount).lt(new Float64('50000'))) {
            throw '50k is the minimum buy in'
        }
        if (new Float64(amount).gt(new Float64('375000'))) {
            throw '375k is the maximum buy in'
        }
        if(storage.has(account+'_fish')){
          let amtfish = storage.get(account+'_fish') // the min. price of fish is always 0.75, any person at least paid 0.75/fish
          let amtiostpaid = new Float64(amtfish).multi(new Float64('0.75'));
          if (amtiostpaid.plus(new Float64(amount)).gt(new Float64('375000'))){ //trying to deposit over 375k
            throw 'sorry max buyin is 375k for ambassador'
          }
        }
        blockchain.callWithAuth('token.iost', 'transfer', [
            'iost',
            account,
            blockchain.contractName(),
            amount,
            'Ambassador Buyin of ' + amount + ' IOST'
        ]);
        let chipsbought = this._mintChips(account, amount, storage.get('tokenPrice'), storage.get('chipsCurrSupply'), true, '0');
        this.chipstofish(account, chipsbought);
        this._addIOSTCounter(amount);
        //all ambassadors funds can be safely voted to the node.
        blockchain.callWithAuth('vote_producer.iost', 'vote', [
            blockchain.contractName(),
            "thevault",
            amount
        ]);
        storage.put('voted',new Float64(storage.get('voted')).plus(new Float64(amount)).toFixed(8).toString())
    }
    /**
     * Grabs the token balance of the contract.
     */
    _getTokenBalance(token) {
        const tokenBalArgs = [token, blockchain.contractName()];
        return blockchain.call("token.iost", "balanceOf", JSON.stringify(tokenBalArgs));
    }
    /**
     * Function to convert CHIPS to FISH. FISH cannot be sold.
     * The number of CHIPS you own is actually account+'_chips' - account+'_fish'
     * FISH works as a negative counter.
     * Why? Because you still need to claim the equivalent amount of CHIPS Divs.
     */
    chipstofish(account, amount) {
        if (!blockchain.requireAuth(account, 'active')) {
            throw 'no permission!';
        }
        if (!storage.has(account + '_chips')) {
            throw 'you do not own any chips'
        }

        let chips_owned = storage.get(account + '_chips');
        if (isNaN(new Float64(amount)) || isNaN(new Float64(chips_owned))) {
            throw 'bad inputs';
        }
        if (new Float64(amount).gt(new Float64(chips_owned))) {
            throw 'cannot convert more chips than you own';
        }
        if (!(new Float64(chips_owned).gte(new Float64(amount)))) {
            throw 'second check, cannot convert more chips than you own'
        }
        if (!storage.has(account + '_fish')) {
            storage.put(account + '_fish', '0')
        }
        storage.put(account + '_fish', new Float64(storage.get(account + '_fish')).plus(new Float64(amount)).toFixed(8).toString())
        //increase the supply
        storage.put('fishCurrSupply', new Float64(storage.get('fishCurrSupply')).plus(new Float64(amount)).toFixed(8).toString())
    }
    /**
     * Function to liquidate CHIPS for IOST.
     */
    sell(account, amount) {
        if (!blockchain.requireAuth(account, 'active')) {
            throw 'no permission!';
        }
        //safety checks.
        if (!storage.has(account + '_chips')) {
            throw 'no chips owned'
        }
        if (new Float64(amount).lt(new Float64(1))) {
            throw 'must sell at least 1 chip.'
        }
        let current_chips = new Float64(storage.get(account + '_chips'));
        if (storage.has(account + '_fish')) {
            current_chips = new Float64(current_chips).minus(new Float64(storage.get(account + '_fish')));
        }
        if (isNaN(current_chips) || new Float64(current_chips).lte(new Float64(0))) {
            throw 'invalid amount of chips, cannot sell.'
        }
        let new_balance = new Float64(current_chips).minus(new Float64(amount));
        if (new Float64(new_balance).lt(new Float64('0'))) {
            throw 'cannot sell more chips than you own!'
        }
        blockchain.receipt(JSON.stringify({
            new_balance: new_balance,
            current_chips: current_chips,
            amount: amount
        }));
        //end safety checks
        //Eject all divs to wallet before selling.
        let mychips = new Float64(storage.get(account + '_chips'));
        let mydivs = mychips.multi(new Float64(storage.get('profitPerShare')));
        let myclaimed = new Float64(storage.get(account + '_claimed'));
        if (Math.ceil(myclaimed) < Math.floor(mydivs)) {
            this.claimchipdivs(account); //ensures the max ratio claimed before reduction
        }
        //You cannot sell FISH.
        //reduce claimed by amount of chips sold * profitPerShare.
        let amount_to_reduce = new Float64(storage.get('profitPerShare')).multi(new Float64(amount));
        storage.put(account + '_claimed', new Float64(storage.get(account + '_claimed')).minus(new Float64(amount_to_reduce)).toFixed(8).toString());
        //deduct balance first
        storage.put(account + '_chips', new Float64(storage.get(account + '_chips')).minus(new Float64(amount)).toFixed(8).toString())
        //reduce the supply of chips
        let new_supply = new Float64(storage.get('chipsCurrSupply')).minus(new Float64(amount)).toFixed(8).toString();
        storage.put('chipsCurrSupply', new_supply)
        //calc iost received
        let iost_to_receive = this._calcIOSTReceived(amount, storage.get('tokenPrice'));
        //reduce the token price
        this._decreasePrice(iost_to_receive);
        this._reduceIOSTCounter(iost_to_receive);
        blockchain.receipt(JSON.stringify({
            iost_to_receive: iost_to_receive,
            new_supply: new_supply
        }));
        let fryFee = new Float64(iost_to_receive).multi(new Float64('0.01')).toFixed(8).toString(); //1 percent fry investment fund
        this._fryInvestmentFund(fryFee);
        let devFee = new Float64(iost_to_receive).multi(new Float64('0.01')).toFixed(8).toString(); //1 percent dev fee
        this._devFee(devFee);
        let dividends = new Float64(iost_to_receive).multi(new Float64('0.08')).toFixed(8).toString(); //8 percent dividends
        this._payDividends(account, dividends);
        let buybackFee = new Float64(iost_to_receive).multi(new Float64('0.01')).toFixed(8).toString(); //1 percent B&B + B&D
        this._buyBack(buybackFee);
        iost_to_receive = new Float64(iost_to_receive).minus(new Float64(fryFee)); //subtract out the fry fee.
        iost_to_receive = new Float64(iost_to_receive).minus(new Float64(devFee)); //subtract out the dev fee.
        iost_to_receive = new Float64(iost_to_receive).minus(new Float64(dividends)); //subtract out the dividends.
        iost_to_receive = new Float64(iost_to_receive).minus(new Float64(buybackFee)).toFixed(8).toString(); //subtract out the buyback fee
        //transfer iost here
        blockchain.callWithAuth('token.iost', 'transfer', [
            'iost',
            blockchain.contractName(),
            account,
            iost_to_receive,
            'Sold ' + amount + ' chips for ' + iost_to_receive + ' IOST.'
        ]);

    }

    /**
     * Reduce the IOST balance counter. For reference only.
     */
    _reduceIOSTCounter(amount) {
        let iost_in_contract = storage.get('iost_in_contract');
        let update = new Float64(iost_in_contract).minus(new Float64(amount)).toFixed(8).toString()
        storage.put('iost_in_contract', update)
        blockchain.receipt(JSON.stringify({
            old_iost_in_contract: iost_in_contract,
            update: update
        }));
    }

    /**
     * Buyback function called only by the contract when it has to reinvest voter rewards or the 1% on sell.
     */
    _buyBack(amount) {
        //50% Buyback and Burn + 50% Buyback and Distribute for FISH holders

        let profitPerShare_fish = storage.get('profitPerShare_fish');
        storage.put('is_selling','true'); //set the selling variable to true.

        let buyback_amount = this.buyin(blockchain.contractName(), blockchain.contractName(), amount)
        //half the amount goes to chips_div_per_fish_share
        let chips_div_per_fish_share = new Float64(buyback_amount).div(new Float64(2)) //50% Buyback and Distribute.
        let fish_curr_supply = storage.get('fishCurrSupply');
        chips_div_per_fish_share = new Float64(chips_div_per_fish_share).div(new Float64(fish_curr_supply));
        let newpps = new Float64(profitPerShare_fish).plus(new Float64(chips_div_per_fish_share)).toFixed(8).toString();
        storage.put('profitPerShare_fish', newpps)
        //burn the other 50%, essentially sets the contract's owned chips to 0, and reduce supply.
        let burned = new Float64(buyback_amount).div(new Float64(2))
        storage.put('chipsCurrSupply', new Float64(storage.get('chipsCurrSupply')).minus(burned).toFixed(8).toString());

        storage.put(blockchain.contractName() + '_chips', new Float64(storage.get(blockchain.contractName() + '_chips')).minus(burned).toFixed(8).toString());

        blockchain.receipt(JSON.stringify({
            original_ppsfish: profitPerShare_fish,
            new_ppsfish: newpps,
            chipdivpershare: chips_div_per_fish_share,
            burned_chips: burned
        }));
    }


    /**
     * Allows the user to claim their CHIPS divs in terms of
     * (profitPerShare*account+'_chips') - account+'_claimed'
     */
    claimchipdivs(account) {
        if (!blockchain.requireAuth(account, 'active')) {
            throw 'no permission!';
        }
        if (!storage.has(account + '_chips')) {
            throw 'you dont own any chips'
        }
        let checkDivs = storage.get('profitPerShare')
        if (!storage.has(account + '_claimed')) {
            storage.put(account + '_claimed', '0');
        }
        let claimed = storage.get(account + '_claimed');
        let divs = new Float64(checkDivs).multi(new Float64(storage.get(account + '_chips')))
        divs = new Float64(divs).minus(new Float64(claimed)).toFixed(8).toString();
        blockchain.callWithAuth('token.iost', 'transfer', [
            'iost',
            blockchain.contractName(),
            account,
            divs,
            'I am claiming my CHIPS divs for ' + divs + ' IOST'
        ]);
	      this._reduceIOSTCounter(divs);
        storage.put(account + '_claimed', new Float64(claimed).plus(new Float64(divs)).toFixed(8).toString());

    }
    /**
     * Allows Justin or MC to unvote funds from the node starting on December 5th.
     */
    nodeUnvote(node, amount) {
        //this command may not be called until december 5th
        let public_start_time = Number(1575583200); //december 5th 2:00pm PST
        let current_time = JSON.parse(blockchain.blockInfo()).time;
        current_time = Number(current_time) / 1000000000
        blockchain.receipt(JSON.stringify({
            current_time: current_time,
            public_start_time: public_start_time
        }));
        if (current_time < public_start_time) {
            throw 'node unvoting not active until Dec 5 2019'
        }
        if (blockchain.requireAuth('kingofiost', 'active') || blockchain.requireAuth('dividends', 'active')) {
            //MC or Justin may control the node unvoting in case of emergency ONLY after Dec 5th.
            blockchain.callWithAuth('vote_producer.iost', 'unvote', [
                blockchain.contractName(),
                node,
                amount
            ]);
        } else {
            throw 'no permission!';
        }

    }
    /**
     * Allows Justin or MC to vote funds to the node starting on December 5th.
     * Built in safety check to ensure the hourglass is at minimum 20% liquid at all times.
     */
    nodeVote(node, amount) {
        //this command may not be called until december 5th
        let public_start_time = Number(1575583200); //december 5th 2:00pm PST
        let current_time = JSON.parse(blockchain.blockInfo()).time;
        current_time = Number(current_time) / 1000000000
        blockchain.receipt(JSON.stringify({
            current_time: current_time,
            public_start_time: public_start_time
        }));
        if (current_time < public_start_time) {
            throw 'node voting not active until Dec 5 2019'
        }
        //For safety, the hourglass must ALWAYS remain at least 20% liquid at all times.
        let iost_in_contract = this._getTokenBalance('iost');
        let totaliost = Number(iost_in_contract) + Number(storage.get('voted'))
        let twentypct = totaliost*0.2;
        if (iost_in_contract-Number(amount) < twentypct){ //if we are attempting to vote over twenty percent of all funds, throw error
            throw 'Sorry, cannot vote more than 20% of liquid funds.'
        }

        if (blockchain.requireAuth('kingofiost', 'active') || blockchain.requireAuth('dividends', 'active')) {
            //MC or Justin may control the node unvoting in case of emergency ONLY after Dec 5th.
            blockchain.callWithAuth('vote_producer.iost', 'vote', [
                blockchain.contractName(),
                node,
                amount
            ]);
        } else {
            throw 'no permission!';
        }
    }
    /**
     * Allows anyone to trigger contract to reinvest the voter rewards.
     * Cannot be activated until Dec 5th.
     */
    voterrewards() {
        //this command may not be called until december 5th. anyone may call this command.
        let public_start_time = Number(1575583200); //december 5th 2:00pm PST
        let current_time = JSON.parse(blockchain.blockInfo()).time;
        current_time = Number(current_time) / 1000000000
        blockchain.receipt(JSON.stringify({
            current_time: current_time,
            public_start_time: public_start_time
        }));
        if (current_time < public_start_time) {
            throw 'voter rewards not active until Dec 5 2019'
        }
        //snapshot balance before claim.
        let balancesnapshot = this._getTokenBalance('iost');
        this._voterWithdraw(blockchain.contractName());
        let newsnapshot = this._getTokenBalance('iost');
        //100% of node voter rewards goes to buyback.
        let amtbuyback = new Float64(newsnapshot).minus(new Float64(balancesnapshot)).toFixed(8).toString();
        this._buyBack(amtbuyback);
    }

    /**
     * Claim FISH dividends from the CHIPS that are bought back through function _buyBack()
     * Similar design as CHIPS, uses (profitPerShare_fish*account+'_fish') - account+'_fishclaimed'
     */
    claimfishdivs(account) {
        if (!blockchain.requireAuth(account, 'active')) {
            throw 'no permission!';
        }
        if (!storage.has(account + '_fish')) {
            throw 'you dont own any fish'
        }
        if (!storage.has(account + '_chips')) {
            throw 'you dont own any chips'
        }
        let checkDivs = storage.get('profitPerShare_fish')
        if (!storage.has(account + '_fishclaimed')) {
            storage.put(account + '_fishclaimed', '0');
        }
        let claimed = storage.get(account + '_fishclaimed');
        let divs = new Float64(checkDivs).multi(new Float64(storage.get(account + '_fish')))
        divs = new Float64(divs).minus(new Float64(claimed)).toFixed(8).toString();
        if (new Float64(divs).lte(new Float64(0))) {
            throw 'no fish divs to claim'
        }
        storage.put(account + '_fishclaimed', new Float64(claimed).plus(new Float64(divs)).toFixed(8).toString());
        let chips_received = new Float64(storage.get(account + '_chips')).plus(new Float64(divs)).toFixed(8).toString();
        let new_contract_bal = new Float64(storage.get(blockchain.contractName() + '_chips')).minus(new Float64(divs)).toFixed(8).toString();
        storage.put(blockchain.contractName() + '_chips', new_contract_bal)
        storage.put(account + '_chips', chips_received)
        blockchain.receipt(JSON.stringify({
            chips_received: chips_received,
            fishclaimed: claimed,
            divs: divs,
            new_contract_bal: new_contract_bal
        }));
    }
    /**
     * Allows the contract to withdraw voter rewards.
     */
    _voterWithdraw(voter) {
        let contract = "vote_producer.iost";
        let api = "voterWithdraw";
        let args = [voter];
        this._call(contract, api, args);
    }
    /**
     * Another way to call functions.
     */
    _call(contract, api, args) {
        const ret = blockchain.callWithAuth(contract, api, args);
        if (ret && Array.isArray(ret) && ret.length >= 1) {
            return ret[0] === "" ? "" : JSON.parse(ret[0]);
        }
        return ret;
    }
    /**
     * Used to buy CHIPS and properly distribute dividends/fees.
     */
    buyin(referral, account, amount) {
      if(Number(amount) < 1 || isNaN(amount)){
        throw 'invalid amount';
      }
      if(!storage.has('is_selling')){
        storage.put('is_selling','false'); //default is false.
      }
      if (storage.get('is_selling') == 'false') { //if this is not a buyback from the contract. throw an ERR.

      if (!blockchain.requireAuth(account, 'active')) {
          throw 'no permission!';
       }
      }

    storage.put('is_selling','false'); //set boolean to false until the next call of _buyBack() will set it to true.

      if(account !== "fishnchips") { //FRY Investment Fund will go in after ambassadors, but before the general public.


        let public_start_time = Number(1575237600); //december 1st 2:00pm PST
        let current_time = JSON.parse(blockchain.blockInfo()).time;
        current_time = Number(current_time) / 1000000000
        blockchain.receipt(JSON.stringify({
            current_time: current_time,
            public_start_time: public_start_time
        }));
        if (current_time < public_start_time) {
            throw 'general public buyin has not begun yet'
        }
}
        //transfer iost here
        blockchain.callWithAuth('token.iost', 'transfer', [
            'iost',
            account,
            blockchain.contractName(),
            amount,
            'Buyin of ' + amount + ' IOST'
        ]);

        let refFee = new Float64(amount).multi(new Float64('0.03')).toFixed(8).toString(); //3 percent referrals
        this._referralFee(referral, refFee, account);
        let fryFee = new Float64(amount).multi(new Float64('0.01')).toFixed(8).toString(); //1 percent fry investment fund
        this._fryInvestmentFund(fryFee);
        let devFee = new Float64(amount).multi(new Float64('0.01')).toFixed(8).toString(); //1 percent dev fee
        this._devFee(devFee);
        let dividends = new Float64(amount).multi(new Float64('0.06')).toFixed(8).toString(); //6 percent dividends
        let self_dividends = this._payDividends(account, dividends);
        amount = new Float64(amount).minus(new Float64(refFee)); //subtract out the referral fee.
        amount = new Float64(amount).minus(new Float64(fryFee)); //subtract out the fry fee.
        amount = new Float64(amount).minus(new Float64(devFee)); //subtract out the dev fee.
        amount = new Float64(amount).minus(new Float64(dividends)).toFixed(8).toString(); //subtract out the dev fee.
        //add to internal counter
        this._addIOSTCounter(amount);
        //mint new chips
        let mychip = this._mintChips(account, amount, storage.get('tokenPrice'), storage.get('chipsCurrSupply'), false, self_dividends);
        //increase the token price
        this._increasePrice(amount);
        return mychip;
    }
    /**
     * Used to increase the token price.
     */
    _increasePrice(amount) {
        let inc = new Float64('0.0000001'); //.1 per million
        let price_increase = new Float64(amount).multi(new Float64(inc)).toFixed(8).toString();
        let token_price = storage.get('tokenPrice');
        let new_token_price = new Float64(token_price).plus(new Float64(price_increase)).toFixed(8).toString();
        storage.put('tokenPrice', new_token_price)
        blockchain.receipt(JSON.stringify({
            old_token_price: token_price,
            new_token_price: new_token_price,
            price_increase: price_increase
        }));
    }
    /**
     * Used to decrease the token price.
     */
    _decreasePrice(amount) {
        let inc = new Float64('0.0000001'); //.1 per million
        let price_decrease = new Float64(amount).multi(new Float64(inc)).toFixed(8).toString();
        let token_price = storage.get('tokenPrice');
        let new_token_price = new Float64(token_price).minus(new Float64(price_decrease)).toFixed(8).toString();
        storage.put('tokenPrice', new_token_price)
        blockchain.receipt(JSON.stringify({
            old_token_price: token_price,
            new_token_price: new_token_price,
            price_decrease: price_decrease
        }));
    }
    /**
     * Used to calculate how much profit per share increased to distribute dividends
     */
    _payDividends(account, amount) {
        let profit_per_share = storage.get('profitPerShare');
        let chips_curr_supply = storage.get('chipsCurrSupply');
        let dividend_per_share = new Float64(amount).div(new Float64(chips_curr_supply)).toFixed(8).toString();
        let updated_profit_per_share = new Float64(profit_per_share).plus(new Float64(dividend_per_share)).toFixed(8).toString()
        storage.put('profitPerShare', updated_profit_per_share);
        blockchain.receipt(JSON.stringify({
            profit_per_share: profit_per_share,
            updated_profit_per_share: updated_profit_per_share,
            dividend_per_share: dividend_per_share,
            chipsCurrSupply: chips_curr_supply
        }));
        return dividend_per_share;
    }
    /**
     * Used to add IOST to the contract balance counter. Reference only.
     */
    _addIOSTCounter(amount) {
        let iost_in_contract = storage.get('iost_in_contract');
        let update = new Float64(iost_in_contract).plus(new Float64(amount)).toFixed(8).toString()
        storage.put('iost_in_contract', update)
        blockchain.receipt(JSON.stringify({
            old_iost_in_contract: iost_in_contract,
            update: update
        }));
    }
    /**
     * Used to send the FRY investment fund fee.
     */
    _fryInvestmentFund(amount) {
        blockchain.callWithAuth('token.iost', 'transfer', [
            'iost',
            blockchain.contractName(),
            'escrow', //FRY Investment fund account
            amount,
            'Sent ' + amount + ' IOST for FRY Invest Fund.'
        ]);
    }
    /**
     * Used to send the development fee.
     */
    _devFee(amount) {
        let dev_fee = new Float64(amount).multi(new Float64('0.5')).toFixed(8).toString(); //half to each person
        blockchain.callWithAuth('token.iost', 'transfer', [
            'iost',
            blockchain.contractName(),
            'kingofiost', //MC's account direct deposit
            dev_fee,
            'Sent ' + dev_fee + ' IOST for Developers.'
        ]);
        blockchain.callWithAuth('token.iost', 'transfer', [
            'iost',
            blockchain.contractName(),
            'dividends', //Justin's account direct deposit
            dev_fee,
            'Sent ' + dev_fee + ' IOST for Developers.'
        ]);
    }
    /**
     * Used to send the referral fee. On buyback the contract refers itself, and should land on the third (else) case.
     */
    _referralFee(referral, amount, account) {
        if (account !== blockchain.contractName() && referral === account) { //if you refer yourself, it doesn't count
            //3 pct fee for referral
            //1 pct fee for marketing
            //2 pct fee for FRY Investment Fund
            referral = "escrow"; //your referral becomes the FRY re-investment wallet
            let marketing_account = 'moonmission';
            let marketing_amount = new Float64(amount).multi(new Float64('0.333333333')).toFixed(8).toString(); //33.33% of 1% fee
            blockchain.callWithAuth('token.iost', 'transfer', [
                'iost',
                blockchain.contractName(),
                marketing_account,
                marketing_amount,
                'Sent ' + marketing_amount + ' IOST for marketing.'
            ]);
            let fry_investment_fund = new Float64(amount).multi(new Float64('0.666666666')).toFixed(8).toString(); //66.66% of 1% fee
            blockchain.callWithAuth('token.iost', 'transfer', [
                'iost',
                blockchain.contractName(),
                referral,
                fry_investment_fund,
                'Sent ' + fry_investment_fund + ' IOST for FRY Investment Fund.'
            ]);
        } else if (!(storage.has(referral + '_chips') || storage.has(referral + '_fish') || account == blockchain.contractName())) { //if your referral is not part of FishnChips
            //3 pct fee for referral
            //1 pct fee for marketing
            //2 pct fee for FRY Investment Fund
            referral = "escrow"; //your referral becomes the FRY re-investment wallet
            let marketing_account = 'moonmission';
            let marketing_amount = new Float64(amount).multi(new Float64('0.333333333')).toFixed(8).toString(); //33.33% of 1% fee
            blockchain.callWithAuth('token.iost', 'transfer', [
                'iost',
                blockchain.contractName(),
                marketing_account,
                marketing_amount,
                'Sent ' + marketing_amount + ' IOST for marketing.'
            ]);
            let fry_investment_fund = new Float64(amount).multi(new Float64('0.666666666')).toFixed(8).toString(); //66.66% of 1% fee
            blockchain.callWithAuth('token.iost', 'transfer', [
                'iost',
                blockchain.contractName(),
                referral,
                fry_investment_fund,
                'Sent ' + fry_investment_fund + ' IOST for FRY Investment Fund.'
            ]);
        } else { //3pct to referral
            let referral_commission = new Float64(amount).toFixed(8).toString(); //3pct
            blockchain.callWithAuth('token.iost', 'transfer', [
                'iost',
                blockchain.contractName(),
                referral,
                referral_commission,
                'Sent ' + referral_commission + ' IOST for Referral.'
            ]);
        }


    }
    /**
     * Used to generate CHIPS through the buy function.
     */
    _mintChips(account, amount, token_price, chips_curr_supply, ambassador, self_dividends) {
        if (!storage.has(account + '_chips')) {
            storage.put(account + '_chips', '0');
        }
        let chips_owned = storage.get(account + '_chips');
        if (isNaN(chips_owned)) {
            storage.put(account + '_chips', '0');
            chips_owned = '0';
        }
        let chips_to_receive = '0';
        if (ambassador) {
            chips_to_receive = new Float64(amount).div(new Float64('0.75')).toFixed(8).toString();
        } else {
            chips_to_receive = this._calcChipsReceived(amount, token_price);
        }
        if (new Float64(chips_to_receive).lt(new Float64(1))) {
            throw 'you must buy at least 1 CHIPS!';
        }
        let sum = new Float64(chips_owned).plus(new Float64(chips_to_receive)).toFixed(8).toString();
        storage.put(account + '_chips', sum)

        //subtract the profitPerShare from your own dividends. You don't receive divs on your own buy.
        if (!storage.has(account + '_claimed')) {
            storage.put(account + '_claimed', '0');
        }
        let claimed = storage.get(account + '_claimed');
        if (isNaN(new Float64(claimed))) {
            storage.put(account + '_claimed', '0');
        }
        claimed = storage.get(account + '_claimed');

        let selfclaim = new Float64(claimed).plus(new Float64(storage.get('profitPerShare')).multi(new Float64(chips_to_receive))).toFixed(8).toString()
        storage.put(account + '_claimed', selfclaim)
        //next part

        let new_supply = new Float64(chips_curr_supply).plus(new Float64(chips_to_receive)).toFixed(8).toString();
        storage.put('chipsCurrSupply', new_supply)
        blockchain.receipt(JSON.stringify({
            chips_to_receive: chips_to_receive,
            chips_owned: sum,
            chipsCurrSupply: new_supply,
            self_dividends: self_dividends,
            selfclaim: selfclaim,
            claimed: claimed,
        }));
        return chips_to_receive;
    }
    /**
     * Quadratic solver to calculate slippage when buying tokens. Uses partial summations.
     * If loops were possible on blockchain, you'd get the same answer.
     */
    _solve(a, b, c) {
        //quadratic formula to solve summation
        let result = new Float64(new Float64(-1).multi(new Float64(b)).plus(new Float64(Math.sqrt(new Float64(Math.pow(b, 2)).minus(new Float64(4).multi(new Float64(a).multi(new Float64(c)))))))).div(new Float64(a).multi(new Float64(2)));
        //simple form from vanilla js below
        // let result = (-1 * b + Math.sqrt(Math.pow(b, 2) - (4 * a * c))) / (2 * a);
        return result + 1; //need to add 1 for correct answer
    }
    /**
     * Calculate how many CHIPS to send.
     */
    _calcChipsReceived(iostamount, token_price) {
        let have = iostamount;
        blockchain.receipt(JSON.stringify({
          iostamount:iostamount
        }));
        let inc = new Float64('0.0000001'); //.1 per million
        let price = token_price;
        let a = new Float64(inc).div(new Float64(2));
        let x = this._solve(a, new Float64(price).plus(new Float64(a)), new Float64(price).minus(new Float64(have)))
        // let x = this._solve(inc*.5,price+.5*inc,price-have)
        return x;

    }
    /**
     * Calculate how many IOST to send. Back-solves the quadratic equation to obtain the original IOST amount.
     */
    _calcIOSTReceived(chips, price) {
        let inc = new Float64('0.0000001'); //.1 per million
        chips = new Float64(chips).minus(new Float64(1)); //subtract 1 from chips from 1 added in _solve()
        price = new Float64(price);
        let pt1 = new Float64(price).multi(new Float64(chips))
        let pt2 = new Float64(inc).multi(new Float64(chips).multi(new Float64(chips).multi(new Float64('0.5'))));
        let pt3 = new Float64(inc).multi(new Float64('0.5').multi(new Float64(chips)))

        let ans = new Float64(price).plus(new Float64(pt1).plus(new Float64(pt2).plus(new Float64(pt3))));
        //(inc+1+(inc*chips))
        ans = new Float64(ans).div(inc.plus(1).plus(inc.multi(chips))).toFixed(8).toString();
        return ans;
    }
}
module.exports = FishnChips;
